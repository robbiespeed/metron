import {
  COLLECTION_EMIT_TYPE_CLEAR,
  COLLECTION_EMIT_TYPE_KEY_ADD,
  COLLECTION_EMIT_TYPE_KEY_DELETE,
  COLLECTION_EMIT_TYPE_KEY_SWAP,
  COLLECTION_EMIT_TYPE_KEY_WRITE,
} from '@metron/core/collection.js';
import type { Disposer } from '@metron/core/emitter.js';
import {
  LIST_EMIT_TYPE_APPEND,
  LIST_EMIT_TYPE_SPLICE,
  isAtomList,
  type AtomList,
  type AtomListEmit,
} from '@metron/core/list.js';
import {
  emitterKey,
  isAtom,
  untracked,
  runAndSubscribe,
} from '@metron/core/particle.js';
import {
  scheduleCleanup,
  scheduleMicroTask,
  setCleanupScheduler,
  setMicroTaskScheduler,
} from '@metron/core/schedulers.js';
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

    renderInto(parent, nodes, disposers, children, contextStore, isOnlyChild);
  },
  [NODE_TYPE_FRAGMENT](
    parent,
    nodes,
    disposers,
    { children },
    contextStore,
    isOnlyChild
  ) {
    renderInto(parent, nodes, disposers, children, contextStore, isOnlyChild);
  },
  [NODE_TYPE_INTRINSIC](
    parent,
    nodes,
    disposers,
    intrinsic,
    contextStore,
    isOnlyChild
  ) {
    const { children, ...props } = intrinsic.props as Record<string, unknown>;

    const element = document.createElement(intrinsic.tag);

    nodes.push(element);

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
  },
  [NODE_TYPE_CONTEXT_PROVIDER]() {
    throw new Error('Not Implemented');
  },
  Raw(parent, nodes, disposers, { value, disposer }) {
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

/**
 * @private
 */
export function renderInto(
  parent: ParentNode,
  nodes: ChildNode[],
  disposers: Disposer[],
  value: unknown,
  contextStore: ComponentContextStore,
  isOnlyChild = false
): void {
  if (value === undefined) {
    return;
  }

  if (typeof value === 'object') {
    if (isJsxNode(value)) {
      return jsxRender[value.nodeType](
        parent,
        nodes,
        disposers,
        value as any,
        contextStore,
        isOnlyChild
      );
    } else if (isIterable(value) && typeof value === 'object') {
      for (const child of value) {
        renderInto(parent, nodes, disposers, child, contextStore);
      }
      return;
    } else if (isAtom(value)) {
      if (isAtomList(value)) {
        return renderAtomListInto(
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
        return;
      }
    }
  }
  // createTextNode casts to string
  nodes.push(document.createTextNode(value as any));
}

type NonEmptyChildNodes = [ChildNode, ...ChildNode[]];
type Empty = [];
type IndexedNodes = (NonEmptyChildNodes | Empty)[];
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
    const childDisposerContainer: Disposer[] = [];
    const childNodeContainer: ChildNode[] = [];
    renderInto(
      parent,
      childNodeContainer,
      childDisposerContainer,
      value,
      contextStore
    );
    indexedDisposers.push(
      childDisposerContainer.length > 0 ? childDisposerContainer : EMPTY_ARRAY
    );
    indexedNodes.push(
      childNodeContainer.length > 0
        ? (childNodeContainer as NonEmptyChildNodes)
        : EMPTY_ARRAY
    );
    firstNodes.push(...childNodeContainer);
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

  const swapNodeLists = (
    aNodes: NonEmptyChildNodes,
    bNodes: NonEmptyChildNodes
  ) => {
    const firstA = aNodes[0];
    const lastB = bNodes.at(-1)!;
    const afterB = lastB.nextSibling;
    const beforeA = firstA.previousSibling;

    if (afterB === null) {
      append(...aNodes);
    } else {
      afterB.before(...aNodes);
    }
    if (beforeA === null) {
      prepend(...bNodes);
    } else {
      beforeA.after(...bNodes);
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
        let newDisposers: Disposer[] = [];
        let newNodes: ChildNode[] = [];

        renderInto(parent, newNodes, newDisposers, value, contextStore);

        newDisposers = newDisposers.length > 0 ? newDisposers : EMPTY_ARRAY;
        newNodes = newNodes.length > 0 ? newNodes : EMPTY_ARRAY;

        if (key === oldSize) {
          append(...newNodes);
          indexedDisposers.push(newDisposers);
          indexedNodes.push(newNodes as []);
        } else {
          if (newNodes !== EMPTY_ARRAY) {
            const rightIndex = findIndexOfNodesToRight(indexedNodes, key);
            if (rightIndex < 0) {
              append(...newNodes);
            } else {
              indexedNodes[rightIndex]![0]!.before(...newNodes);
            }
          }
          indexedDisposers.splice(key, 0, newDisposers);
          indexedNodes.splice(key, 0, newNodes as []);
        }

        return;
      }
      case COLLECTION_EMIT_TYPE_KEY_DELETE: {
        const { key, size } = message;

        const oldDisposers = indexedDisposers[key]!;
        if (oldDisposers !== EMPTY_ARRAY) {
          scheduleCleanup(() => dispose(oldDisposers));
        }
        for (const node of indexedNodes[key]!) {
          parent.removeChild(node);
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

        const aNodes = indexedNodes[keyA]!;
        const bNodes = indexedNodes[keyB]!;

        if (aNodes === bNodes) {
          // If A and B are the same they must both be EMPTY_ARRAY
          return;
        }

        if (aNodes !== EMPTY_ARRAY) {
          assertOverride<NonEmptyChildNodes>(aNodes);
          if (bNodes !== EMPTY_ARRAY) {
            assertOverride<NonEmptyChildNodes>(bNodes);
            swapNodeLists(aNodes, bNodes);
          } else {
            const rightOfBIndex = findIndexOfNodesToRight(indexedNodes, keyB);
            if (rightOfBIndex < 0) {
              append(...aNodes);
            } else {
              indexedNodes[rightOfBIndex]![0]!.before(...aNodes);
            }
          }
        } else {
          const rightOfAIndex = findIndexOfNodesToRight(indexedNodes, keyA);
          if (rightOfAIndex < keyB) {
            indexedNodes[rightOfAIndex]![0]!.before(...bNodes);
          }
        }

        const tmpDisposers = indexedDisposers[keyA]!;
        indexedDisposers[keyA] = indexedDisposers[keyB]!;
        indexedDisposers[keyB] = tmpDisposers;
        indexedNodes[keyA] = bNodes;
        indexedNodes[keyB] = aNodes;

        return;
      }
      case LIST_EMIT_TYPE_APPEND: {
        const { oldSize } = message;

        const newNodes: ChildNode[] = [];
        const newValues = rawList.toArraySlice(oldSize);

        for (const child of newValues) {
          const childNodes: ChildNode[] = [];
          const childDisposers: Disposer[] = [];
          renderInto(parent, childNodes, childDisposers, child, contextStore);
          indexedDisposers.push(
            childDisposers.length > 0 ? childDisposers : EMPTY_ARRAY
          );
          indexedNodes.push(
            childNodes.length > 0 ? (childNodes as []) : EMPTY_ARRAY
          );
          newNodes.push(...childNodes);
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

        const oldNodes = indexedNodes[key]!;

        const newValue = rawList.at(key);
        const newDisposers: Disposer[] = [];
        const newNodes: ChildNode[] = [];
        renderInto(parent, newNodes, newDisposers, newValue, contextStore);
        indexedDisposers[key] =
          newDisposers.length > 0 ? newDisposers : EMPTY_ARRAY;
        if (newNodes.length > 0) {
          indexedNodes[key] = newNodes as NonEmptyChildNodes;

          if (oldNodes === EMPTY_ARRAY) {
            const rightIndex = findIndexOfNodesToRight(indexedNodes, key);
            if (rightIndex < 0) {
              append(...newNodes);
            } else {
              indexedNodes[rightIndex]![0]!.before(...newNodes);
            }
          } else {
            oldNodes[0]!.before(...newNodes);
          }
        } else {
          indexedNodes[key] = EMPTY_ARRAY;
        }

        for (const node of oldNodes) {
          parent.removeChild(node);
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
            const childNodes: ChildNode[] = [];
            const childDisposers: Disposer[] = [];
            renderInto(parent, childNodes, childDisposers, child, contextStore);
            indexedDisposers.push(
              childDisposers.length > 0 ? childDisposers : EMPTY_ARRAY
            );
            indexedNodes.push(
              childNodes.length > 0 ? (childNodes as []) : EMPTY_ARRAY
            );
            newNodes.push(...childNodes);
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
            const childNodes: ChildNode[] = [];
            const childDisposers: Disposer[] = [];
            renderInto(parent, childNodes, childDisposers, child, contextStore);
            addedIndexedDisposers.push(
              childDisposers.length > 0 ? childDisposers : EMPTY_ARRAY
            );
            addedIndexedNodes.push(
              childNodes.length > 0 ? (childNodes as []) : EMPTY_ARRAY
            );
            newNodes.push(...childNodes);
          }

          if (newNodes.length > 0) {
            const rightIndex = findIndexOfNodesToRight(indexedNodes, start);
            if (rightIndex < 0) {
              append(...newNodes);
            } else {
              indexedNodes[rightIndex]![0]!.before(...newNodes);
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
        for (const nodes of deletedIndexedNodes) {
          for (const node of nodes) {
            parent.removeChild(node);
          }
        }

        return;
      }
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

function findIndexOfNodesToRight(
  indexedNodes: IndexedNodes,
  index: number
): number {
  for (let i = index + 1; i < indexedNodes.length; i++) {
    const nodes = indexedNodes[i];
    if (nodes !== EMPTY_ARRAY) {
      return i;
    }
  }
  return -1;
}

// TODO: move to shared package
function assertOverride<T>(value: unknown): asserts value is T {}
