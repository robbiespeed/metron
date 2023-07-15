import {
  COLLECTION_EMIT_TYPE_CLEAR,
  COLLECTION_EMIT_TYPE_KEY_ADD,
  COLLECTION_EMIT_TYPE_KEY_DELETE,
  COLLECTION_EMIT_TYPE_KEY_SWAP,
  COLLECTION_EMIT_TYPE_KEY_WRITE,
} from 'metron-core/collection.js';
import type { Disposer } from 'metron-core/emitter.js';
import {
  LIST_EMIT_TYPE_APPEND,
  LIST_EMIT_TYPE_SPLICE,
  isAtomList,
  type AtomList,
  type AtomListEmit,
  LIST_EMIT_TYPE_REVERSE,
  LIST_EMIT_TYPE_SORT,
} from 'metron-core/list.js';
import {
  emitterKey,
  isAtom,
  untracked,
  runAndSubscribe,
} from 'metron-core/particle.js';
import {
  scheduleCleanup,
  scheduleMicroTask,
  setCleanupScheduler,
  setMicroTaskScheduler,
} from 'metron-core/schedulers.js';
import {
  NODE_TYPE_COMPONENT,
  NODE_TYPE_CONTEXT_PROVIDER,
  NODE_TYPE_FRAGMENT,
  NODE_TYPE_INTRINSIC,
  NODE_TYPE_RENDER_CONTEXT,
  createContext,
  isJsxNode,
  type ComponentContextStore,
  type JsxNode,
  type JsxProps,
  NODE_TYPE_RAW,
  type JsxIntrinsicNode,
} from '../node.js';
import { isIterable } from '../utils.js';

// TODO move to an init function
setCleanupScheduler(requestIdleCallback);
setMicroTaskScheduler(queueMicrotask);

interface DomRenderContextProps extends JsxProps {
  readonly root: ParentNode;
  readonly children: unknown;
}

type JsxRender = {
  [key in JsxNode['nodeType']]: (
    parent: ParentNode,
    nodes: ChildNode[],
    disposers: Disposer[],
    value: Extract<JsxNode, { nodeType: key }>,
    contextStore: ComponentContextStore,
    isOnlyChild?: boolean
  ) => void;
};

export const EVENT_HANDLER_PREFIX = 'on:';
export const EVENT_HANDLER_PREFIX_LENGTH = EVENT_HANDLER_PREFIX.length;

export function render(
  { root, children }: DomRenderContextProps,
  contextStore: ComponentContextStore = {}
): Disposer {
  if (children == null) {
    root.replaceChildren();
    return () => {};
  }

  const nodes: ChildNode[] = [];
  const disposers: Disposer[] = [];

  renderInto(root, nodes, disposers, children, contextStore, true);

  root.replaceChildren(...nodes);

  return () => {
    dispose(disposers);
    disposers.length = 0;
  };
}

/**
 * @private
 */
export const jsxRender: JsxRender = {
  [NODE_TYPE_COMPONENT](
    parent,
    nodes,
    disposers,
    component,
    contextStore,
    isOnlyChild
  ) {
    const { tag, props } = component;

    const componentContext = createContext(contextStore);

    const children = tag(props, componentContext);

    if (children != null) {
      renderInto(parent, nodes, disposers, children, contextStore, isOnlyChild);
    }
  },
  [NODE_TYPE_FRAGMENT](
    parent,
    nodes,
    disposers,
    { children },
    contextStore,
    isOnlyChild
  ) {
    if (children != null) {
      renderInto(parent, nodes, disposers, children, contextStore, isOnlyChild);
    }
  },
  [NODE_TYPE_INTRINSIC](
    parent,
    nodes,
    disposers,
    intrinsic,
    contextStore,
    isOnlyChild
  ) {
    nodes.push(renderIntrinsic(disposers, intrinsic, contextStore));
  },
  [NODE_TYPE_CONTEXT_PROVIDER]() {
    throw new Error('Not Implemented');
  },
  [NODE_TYPE_RAW](parent, nodes, disposers, { value, disposer }) {
    if (disposer !== undefined) {
      disposers.push(disposer);
    }
    if (value instanceof Element) {
      nodes.push(value);
    }
  },
  [NODE_TYPE_RENDER_CONTEXT]() {
    throw new Error('Not Implemented');
  },
};

function dispose(disposers: Disposer[]): void {
  for (const d of disposers) {
    d();
  }
}

function renderIntrinsic(
  disposers: Disposer[],
  intrinsic: JsxIntrinsicNode,
  contextStore: ComponentContextStore
): HTMLElement {
  const { children, ...props } = intrinsic.props as Record<string, unknown>;

  const element = document.createElement(intrinsic.tag);

  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) {
      continue;
    }
    let [keySpecifier, keyName] = key.split(':', 2) as [
      string,
      string | undefined
    ];
    if (keySpecifier === key) {
      keyName = keySpecifier;
      keySpecifier = 'attr';
    }
    if (keySpecifier === 'ref') {
      // If not callable then it's okay to throw
      scheduleMicroTask(() => (value as any)(element));
      continue;
    } else if (keyName === undefined) {
      throw new Error(`Specifier "${keySpecifier}" must have a keyName`);
    }
    switch (keySpecifier) {
      case 'prop':
        if (isAtom(value)) {
          disposers.push(
            runAndSubscribe(value, () => {
              // Expect the user knows what they are doing
              (element as any)[key] = untracked(value);
            })
          );
        } else {
          // Expect the user knows what they are doing
          (element as any)[key] = value;
        }
        break;
      case 'attr':
        if (isAtom(value)) {
          const firstValue = untracked(value);

          if (firstValue === true) {
            element.toggleAttribute(key, true);
          } else if (firstValue !== undefined && firstValue !== false) {
            // setAttribute casts to string
            element.setAttribute(key, firstValue as any);
          }

          disposers.push(
            value[emitterKey](() => {
              const innerValue = untracked(value);
              switch (typeof innerValue) {
                case 'boolean':
                  element.toggleAttribute(key, innerValue);
                  break;
                case 'undefined':
                  element.removeAttribute(key);
                  break;
                default:
                  // setAttribute casts to string
                  element.setAttribute(key, innerValue as any);
                  break;
              }
            })
          );
        } else if (value === true) {
          element.toggleAttribute(keyName, true);
        } else if (value !== false) {
          element.setAttribute(keyName, value as string);
        }
        break;
      case 'on':
        if (isAtom(value)) {
          let eventHandler: EventListenerOrEventListenerObject | undefined;
          disposers.push(
            runAndSubscribe(value, () => {
              if (eventHandler) {
                element.removeEventListener(key, eventHandler);
              }

              // Defer correctness to addEventListener error handling
              eventHandler = untracked(value) as any;
              if (eventHandler !== undefined) {
                element.addEventListener(key, eventHandler);
              }
            })
          );
        } else if (value !== undefined) {
          // Defer to addEventListener error handling
          element.addEventListener(keyName, value as any);
        }
        break;
      default:
        throw new TypeError(`Unsupported specifier "${keySpecifier}"`);
    }
  }

  if (children != null) {
    const childNodeContainer: ChildNode[] = [];
    renderInto(
      element,
      childNodeContainer,
      disposers,
      children,
      contextStore,
      true
    );
    element.append(...childNodeContainer);
  }

  return element;
}

/**
 * @private
 */
export function renderInto(
  parent: ParentNode,
  nodes: ChildNode[],
  disposers: Disposer[],
  value: {},
  contextStore: ComponentContextStore,
  isOnlyChild = false
): void {
  if (typeof value === 'object') {
    if (isJsxNode(value)) {
      jsxRender[value.nodeType](
        parent,
        nodes,
        disposers,
        value as any,
        contextStore,
        isOnlyChild
      );
      return;
    } else if (isIterable(value) && typeof value === 'object') {
      for (const child of value) {
        if (child != null) {
          renderInto(parent, nodes, disposers, child, contextStore);
        }
      }
      return;
    } else if (isAtom(value)) {
      if (isAtomList(value)) {
        renderAtomListInto(
          parent,
          nodes,
          disposers,
          value,
          contextStore,
          isOnlyChild
        );
      } else {
        const firstValue = untracked(value);

        const text = document.createTextNode(
          // createTextNode casts param to string
          firstValue === undefined ? '' : (firstValue as any)
        );
        nodes.push(text);

        disposers.push(
          value[emitterKey](() => {
            const newValue = untracked(value);
            // Data casts to string
            text.data = newValue === undefined ? '' : (newValue as any);
          })
        );
      }
      return;
    }
  }
  // createTextNode casts to string
  nodes.push(document.createTextNode(value as any));
}

/**
 * @private
 */
export function renderChildNode(
  disposers: Disposer[],
  renderValue: {},
  contextStore: ComponentContextStore
): ChildNode | undefined {
  if (typeof renderValue === 'object') {
    if (isJsxNode(renderValue)) {
      switch (renderValue.nodeType) {
        case NODE_TYPE_RAW: {
          const { disposer, value } = renderValue;
          if (disposer !== undefined) {
            disposers.push(disposer);
          }
          if (value instanceof Element) {
            return value;
          }
          return;
        }
        case NODE_TYPE_INTRINSIC:
          return renderIntrinsic(disposers, renderValue, contextStore);
        default:
          throw new Error('Node type must be raw or intrinsic');
      }
    } else if (isIterable(renderValue) && typeof renderValue === 'object') {
      throw new Error('Cannot render iterable to single DOM node');
    } else if (isAtom(renderValue)) {
      if (isAtomList(renderValue)) {
        throw new Error('Cannot render atom list to single DOM node');
      } else {
        const firstValue = untracked(renderValue);

        const text = document.createTextNode(
          // createTextNode casts param to string
          firstValue === undefined ? '' : (firstValue as any)
        );

        disposers.push(
          renderValue[emitterKey](() => {
            const newValue = untracked(renderValue);
            // Data casts to string
            text.data = newValue === undefined ? '' : (newValue as any);
          })
        );
        return text;
      }
    }
  }
  // createTextNode casts to string
  return document.createTextNode(renderValue as any);
}

type Empty = [];
type IndexedNodes = (ChildNode | undefined)[];
type IndexedDisposers = Disposer[][];

const EMPTY_ARRAY: Empty = [];

export function renderAtomListInto(
  parent: ParentNode,
  firstNodes: ChildNode[],
  disposers: Disposer[],
  list: AtomList<unknown>,
  contextStore: ComponentContextStore,
  isOnlyChild: boolean
) {
  const indexedDisposers: IndexedDisposers = [];
  const indexedNodes: IndexedNodes = [];

  // TODO: bench reusing nextDisposerContainer
  // let nextDisposerContainer: Disposer[] = [];

  const rawList = untracked(list);

  const markers: { s: ChildNode; e: ChildNode } | undefined = isOnlyChild
    ? undefined
    : {
        s: document.createTextNode(''),
        e: document.createTextNode(''),
      };

  if (markers !== undefined) {
    firstNodes.push(markers.s);
  }

  for (const value of rawList) {
    let renderedValue: ChildNode | undefined;
    if (value != null) {
      // TODO: bench reusing nextDisposerContainer
      // const childDisposerContainer: Disposer[] = nextDisposerContainer;
      const childDisposerContainer: Disposer[] = [];
      renderedValue = renderChildNode(
        childDisposerContainer,
        value,
        contextStore
      );
      indexedDisposers.push(
        childDisposerContainer.length > 0 ? childDisposerContainer : EMPTY_ARRAY
        // TODO: bench reusing nextDisposerContainer
        // childDisposerContainer.length > 0 ? (nextDisposerContainer = [], childDisposerContainer) : EMPTY_ARRAY
      );
    } else {
      indexedDisposers.push(EMPTY_ARRAY);
    }

    indexedNodes.push(renderedValue);
    if (renderedValue !== undefined) {
      firstNodes.push(renderedValue);
    }
  }

  let clearNodes: () => void;
  let append: (...nodes: ChildNode[]) => void;
  let prepend: (...nodes: ChildNode[]) => void;
  let replaceChildren: (...nodes: ChildNode[]) => void;
  if (markers !== undefined) {
    const { s, e } = markers;
    firstNodes.push(e);
    let range: Range | undefined;

    function initRange() {
      range = document.createRange();
      range.setStartAfter(s);
      range.setEndBefore(e);
      return range;
    }
    clearNodes = () => {
      (range ?? initRange()).deleteContents();
    };
    replaceChildren = function () {
      (range ?? initRange()).deleteContents();
      append.apply(null, arguments as any);
    };
    append = e.before.bind(e);
    prepend = s.after.bind(s);
  } else {
    replaceChildren = parent.replaceChildren.bind(parent);
    clearNodes = replaceChildren;
    append = parent.append.bind(parent);
    prepend = parent.prepend.bind(parent);
  }

  const swapNodes = (aNode: ChildNode, bNode: ChildNode) => {
    const beforeA = aNode.previousSibling;
    bNode.after(aNode);
    if (beforeA === null) {
      prepend(bNode);
    } else {
      beforeA.after(bNode);
    }
  };

  function listChangeHandler(message: AtomListEmit) {
    switch (message.type) {
      case COLLECTION_EMIT_TYPE_CLEAR: {
        const oldIndexedDisposers = indexedDisposers.slice();
        scheduleCleanup(() => disposeIndexed(oldIndexedDisposers));
        clearNodes();
        indexedDisposers.length = 0;
        indexedNodes.length = 0;
        return;
      }
      case COLLECTION_EMIT_TYPE_KEY_ADD: {
        const { key, oldSize } = message;

        const value = rawList.at(key);
        let renderedValue: ChildNode | undefined;
        let newDisposers: Disposer[];
        if (value != null) {
          newDisposers = [];
          renderedValue = renderChildNode(newDisposers, value, contextStore);
          newDisposers = newDisposers.length > 0 ? newDisposers : EMPTY_ARRAY;
        } else {
          newDisposers = EMPTY_ARRAY;
        }

        if (key === oldSize) {
          if (renderedValue !== undefined) {
            append(renderedValue);
          }
          indexedDisposers.push(newDisposers);
          indexedNodes.push(undefined);
        } else {
          if (renderedValue !== undefined) {
            const rightIndex = findIndexOfNodeToRight(indexedNodes, key);
            if (rightIndex < 0) {
              append(renderedValue);
            } else {
              indexedNodes[rightIndex]!.before(renderedValue);
            }
          }
          indexedDisposers.splice(key, 0, newDisposers);
          indexedNodes.splice(key, 0, renderedValue);
        }

        return;
      }
      case COLLECTION_EMIT_TYPE_KEY_DELETE: {
        const { key, size } = message;

        const oldDisposers = indexedDisposers[key]!;
        if (oldDisposers !== EMPTY_ARRAY) {
          scheduleCleanup(() => dispose(oldDisposers));
        }
        const oldNode = indexedNodes[key];
        if (oldNode !== undefined) {
          parent.removeChild(oldNode);
        }

        if (key === size) {
          indexedDisposers.length = size;
          indexedNodes.length = size;
        } else {
          indexedDisposers.splice(key, 1);
          indexedNodes.splice(key, 1);
        }

        return;
      }
      case COLLECTION_EMIT_TYPE_KEY_SWAP: {
        const [keyA, keyB] = message.keySwap;

        const aNode = indexedNodes[keyA];
        const bNode = indexedNodes[keyB];

        if (aNode === bNode) {
          // If A and B are the same they must both be EMPTY_ARRAY
          return;
        }

        if (aNode !== undefined) {
          if (bNode !== undefined) {
            swapNodes(aNode, bNode);
          } else {
            const rightOfBIndex = findIndexOfNodeToRight(indexedNodes, keyB);
            if (rightOfBIndex < 0) {
              append(aNode);
            } else {
              indexedNodes[rightOfBIndex]!.before(aNode);
            }
          }
        } else {
          const rightOfAIndex = findIndexOfNodeToRight(indexedNodes, keyA);
          if (rightOfAIndex < keyB) {
            indexedNodes[rightOfAIndex]!.before(bNode as ChildNode);
          }
        }

        const tmpDisposers = indexedDisposers[keyA]!;
        indexedDisposers[keyA] = indexedDisposers[keyB]!;
        indexedDisposers[keyB] = tmpDisposers;
        indexedNodes[keyA] = bNode;
        indexedNodes[keyB] = aNode;

        return;
      }
      case LIST_EMIT_TYPE_APPEND: {
        const { oldSize } = message;

        const newNodes: ChildNode[] = [];
        const newValues = rawList.toArraySlice(oldSize);

        for (const child of newValues) {
          let renderedValue: ChildNode | undefined;
          if (child != null) {
            const childDisposerContainer: Disposer[] = [];
            renderedValue = renderChildNode(
              childDisposerContainer,
              child,
              contextStore
            );
            indexedDisposers.push(
              childDisposerContainer.length > 0
                ? childDisposerContainer
                : EMPTY_ARRAY
            );
          } else {
            indexedDisposers.push(EMPTY_ARRAY);
          }

          indexedNodes.push(renderedValue);
          if (renderedValue !== undefined) {
            newNodes.push(renderedValue);
          }
        }

        append(...newNodes);

        return;
      }
      case COLLECTION_EMIT_TYPE_KEY_WRITE: {
        const { key } = message;

        const oldDisposers = indexedDisposers[key]!;
        if (oldDisposers !== EMPTY_ARRAY) {
          scheduleCleanup(() => dispose(oldDisposers));
        }

        const oldNode = indexedNodes[key];

        const newValue = rawList.at(key);
        let renderedValue: ChildNode | undefined;

        if (newValue != null) {
          const newDisposers: Disposer[] = [];
          renderedValue = renderChildNode(newDisposers, newValue, contextStore);
          indexedDisposers[key] =
            newDisposers.length > 0 ? newDisposers : EMPTY_ARRAY;
        } else {
          indexedDisposers[key] = EMPTY_ARRAY;
        }

        indexedNodes[key] = renderedValue;
        if (renderedValue !== undefined) {
          if (oldNode === undefined) {
            const rightIndex = findIndexOfNodeToRight(indexedNodes, key);
            if (rightIndex < 0) {
              append(renderedValue);
            } else {
              indexedNodes[rightIndex]!.before(renderedValue);
            }
          } else {
            oldNode.replaceWith(renderedValue);
          }
        } else if (oldNode !== undefined) {
          oldNode.remove();
        }

        return;
      }
      case LIST_EMIT_TYPE_SPLICE: {
        const { start, deleteCount, addCount, oldSize } = message;

        if (deleteCount === oldSize && start === 0) {
          // Fast path for whole list replacement
          const oldIndexedDisposers = indexedDisposers.slice();
          scheduleCleanup(() => disposeIndexed(oldIndexedDisposers));
          indexedDisposers.length = 0;
          indexedNodes.length = 0;

          const newNodes: ChildNode[] = [];

          for (const child of rawList) {
            let renderedValue: ChildNode | undefined;
            if (child != null) {
              const childDisposerContainer: Disposer[] = [];
              renderedValue = renderChildNode(
                childDisposerContainer,
                child,
                contextStore
              );
              indexedDisposers.push(
                childDisposerContainer.length > 0
                  ? childDisposerContainer
                  : EMPTY_ARRAY
              );
            } else {
              indexedDisposers.push(EMPTY_ARRAY);
            }

            indexedNodes.push(renderedValue);
            if (renderedValue !== undefined) {
              newNodes.push(renderedValue);
            }
          }

          replaceChildren(...newNodes);
          return;
        }

        let deletedIndexedDisposers: IndexedDisposers;
        let deletedIndexedNodes: IndexedNodes;

        if (addCount === 0) {
          deletedIndexedDisposers = indexedDisposers.splice(start, deleteCount);
          deletedIndexedNodes = indexedNodes.splice(start, deleteCount);
        } else {
          const addedIndexedDisposers: IndexedDisposers = [];
          const addedIndexedNodes: IndexedNodes = [];
          const newValues = rawList.toArraySlice(start, start + addCount);
          const newNodes: ChildNode[] = [];

          for (const child of newValues) {
            let renderedValue: ChildNode | undefined;
            if (child != null) {
              const childDisposerContainer: Disposer[] = [];
              renderedValue = renderChildNode(
                childDisposerContainer,
                child,
                contextStore
              );
              addedIndexedDisposers.push(
                childDisposerContainer.length > 0
                  ? childDisposerContainer
                  : EMPTY_ARRAY
              );
            } else {
              addedIndexedDisposers.push(EMPTY_ARRAY);
            }

            addedIndexedNodes.push(renderedValue);
            if (renderedValue !== undefined) {
              newNodes.push(renderedValue);
            }
          }

          if (newNodes.length > 0) {
            const rightIndex = findIndexOfNodeToRight(indexedNodes, start);
            if (rightIndex < 0) {
              append(...newNodes);
            } else {
              indexedNodes[rightIndex]!.before(...newNodes);
            }
          }

          deletedIndexedDisposers = indexedDisposers.splice(
            start,
            deleteCount,
            ...addedIndexedDisposers
          );
          deletedIndexedNodes = indexedNodes.splice(
            start,
            deleteCount,
            ...addedIndexedNodes
          );
        }

        if (deletedIndexedDisposers.length > 0) {
          scheduleCleanup(() => disposeIndexed(deletedIndexedDisposers));
        }
        for (const node of deletedIndexedNodes) {
          node?.remove();
        }

        return;
      }
      case LIST_EMIT_TYPE_REVERSE:
        indexedNodes.reverse();
        indexedDisposers.reverse();

        replaceChildren(
          ...indexedNodes.filter(
            (node): node is ChildNode => node !== undefined
          )
        );
        break;
      case LIST_EMIT_TYPE_SORT:
        const { sortMap, size } = message;

        const oldIndexedNodes = indexedNodes.slice();
        const oldIndexedDisposers = indexedDisposers.slice();

        for (let index = 0; index < size; index++) {
          const mappedIndex = sortMap[index]!;
          indexedNodes[index] = oldIndexedNodes[mappedIndex]!;
          indexedDisposers[index] = oldIndexedDisposers[mappedIndex]!;
        }

        replaceChildren(
          ...indexedNodes.filter(
            (node): node is ChildNode => node !== undefined
          )
        );
        break;
      default: {
        throw new Error('Unhandled emit', { cause: message });
      }
    }
  }

  const listEmitDisposer = list[emitterKey](listChangeHandler);

  disposers.push(() => {
    listEmitDisposer();
    disposeIndexed(indexedDisposers);
  });
}

function disposeIndexed(indexedDisposers: IndexedDisposers) {
  for (const disposers of indexedDisposers) {
    for (const d of disposers) {
      d();
    }
  }
}

function findIndexOfNodeToRight(
  indexedNodes: IndexedNodes,
  index: number
): number {
  for (let i = index + 1; i < indexedNodes.length; i++) {
    const node = indexedNodes[i];
    if (node !== undefined) {
      return i;
    }
  }
  return -1;
}

// TODO: move to shared package
// function assertOverride<T>(value: unknown): asserts value is T {}
