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
import { assertOverride } from './shared.js';

// TODO move to an init function
setCleanupScheduler(requestIdleCallback);
setMicroTaskScheduler(queueMicrotask);

interface DomRenderContextProps extends JsxProps {
  readonly root: ParentNode;
  readonly children: unknown;
}

type NodeAppend = (...node: ChildNode[]) => void;

type JsxRender = {
  [key in JsxNode['nodeType']]: (
    parent: ParentNode,
    append: NodeAppend,
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

  const append = root.append.bind(root);
  const disposers: Disposer[] = [];

  renderInto(root, append, disposers, children, contextStore, true);

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
    let [keySpecifier, _keyName] = key.split(':', 2) as [
      string,
      string | undefined
    ];
    if (keySpecifier === key) {
      _keyName = keySpecifier;
      keySpecifier = 'attr';
    }
    const keyName = _keyName ?? keySpecifier;

    switch (keySpecifier) {
      case 'setup':
        (value as Function)(element);
        continue;
      case 'prop':
        if (isAtom(value)) {
          disposers.push(
            runAndSubscribe(value, () => {
              // Expect the user knows what they are doing
              (element as any)[keyName] = untracked(value);
            })
          );
        } else {
          // Expect the user knows what they are doing
          (element as any)[keyName] = value;
        }
        continue;
      case 'attr':
        if (isAtom(value)) {
          const firstValue = untracked(value);

          if (firstValue === true) {
            element.toggleAttribute(keyName, true);
          } else if (firstValue !== undefined && firstValue !== false) {
            // setAttribute casts to string
            element.setAttribute(keyName, firstValue as any);
          }

          disposers.push(
            value[emitterKey](() => {
              const innerValue = untracked(value);
              switch (typeof innerValue) {
                case 'boolean':
                  element.toggleAttribute(keyName, innerValue);
                  break;
                case 'undefined':
                  element.removeAttribute(keyName);
                  break;
                default:
                  // setAttribute casts to string
                  element.setAttribute(keyName, innerValue as any);
                  break;
              }
            })
          );
        } else if (value === true) {
          element.toggleAttribute(keyName, true);
        } else if (value !== false) {
          element.setAttribute(keyName, value as string);
        }
        continue;
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
        continue;
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
  append: (...nodes: ChildNode[]) => void,
  disposers: Disposer[],
  value: {},
  contextStore: ComponentContextStore,
  isOnlyChild = false
): void {
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
        if (child != null) {
          renderInto(parent, nodes, disposers, child, contextStore);
        }
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

interface Bounds {
  s: ChildNode;
  e: ChildNode;
}

function createListDomOperators(
  parent: ParentNode,
  bounds: Bounds | undefined
) {
  let clearNodes: () => void;
  let append: (...nodes: ChildNode[]) => void;
  let prepend: (...nodes: ChildNode[]) => void;
  let replaceChildren: (...nodes: ChildNode[]) => void;
  if (bounds !== undefined) {
    const { s, e } = bounds;
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

  return {
    clearNodes,
    append,
    prepend,
    replaceChildren,
    swapNodeLists,
  };
}

type NonEmptyChildNodes = [ChildNode, ...ChildNode[]];
type Empty = [];
type NonEmptyIndexedItem = { d: Disposer[]; n: NonEmptyChildNodes };
type EmptyIndexedItem = { d: Disposer[]; n: Empty };
type IndexedItem = NonEmptyIndexedItem | EmptyIndexedItem;
type IndexedItems = IndexedItem[];

const EMPTY_ARRAY: Empty = [];
const EMPTY_ITEM: EmptyIndexedItem = { d: EMPTY_ARRAY, n: EMPTY_ARRAY };

// Todo Instead of accepting render bucket, what about accepting an append method
function renderListItemsInto(
  indexStart: number,
  parent: ParentNode,
  renderBucket: ChildNode[],
  indexedItems: IndexedItems,
  listItems: Iterable<unknown>,
  contextStore: ComponentContextStore
) {
  // TODO: bench reusing
  // let nextDisposerContainer: Disposer[] = [];
  // let nextNodeContainer: ChildNode[] = [];

  let i = indexStart;
  for (const value of listItems) {
    if (value == null) {
      indexedItems[i] = EMPTY_ITEM;
    } else {
      const childDisposerContainer: Disposer[] = [];
      const childNodeContainer: ChildNode[] = [];
      renderInto(
        parent,
        childNodeContainer,
        childDisposerContainer,
        value,
        contextStore
      );
      indexedItems[i] = {
        d:
          childDisposerContainer.length > 0
            ? childDisposerContainer
            : EMPTY_ARRAY,
        n: childNodeContainer.length > 0 ? childNodeContainer : EMPTY_ARRAY,
      } as IndexedItem;
      renderBucket.push(...childNodeContainer);
    }
    i++;
  }
}

export function renderAtomListInto(
  parent: ParentNode,
  firstNodes: ChildNode[],
  disposers: Disposer[],
  list: AtomList<unknown>,
  contextStore: ComponentContextStore,
  isOnlyChild: boolean
) {
  const rawList = untracked(list);
  let indexedItems: IndexedItems = new Array(rawList.size);

  const bounds: { s: ChildNode; e: ChildNode } | undefined = isOnlyChild
    ? undefined
    : {
        s: document.createTextNode(''),
        e: document.createTextNode(''),
      };

  if (bounds !== undefined) {
    firstNodes.push(bounds.s);
  }

  renderListItemsInto(
    0,
    parent,
    firstNodes,
    indexedItems,
    rawList,
    contextStore
  );

  const { clearNodes, append, replaceChildren, swapNodeLists } =
    createListDomOperators(parent, firstNodes, bounds);

  function listChangeHandler(message: AtomListEmit) {
    switch (message.type) {
      case COLLECTION_EMIT_TYPE_CLEAR: {
        const oldIndexedItems = indexedItems;
        indexedItems = [];
        scheduleCleanup(() => disposeIndexed(oldIndexedItems));
        clearNodes();
        return;
      }
      case COLLECTION_EMIT_TYPE_KEY_ADD: {
        const { key, oldSize } = message;

        const value = rawList.at(key);
        let newNodes: ChildNode[];

        let indexedItem: IndexedItem;
        if (value == null) {
          newNodes = EMPTY_ARRAY;
          indexedItem = EMPTY_ITEM;
        } else {
          const newDisposers: Disposer[] = [];
          newNodes = [];

          renderInto(parent, newNodes, newDisposers, value, contextStore);

          indexedItem = {
            d: newDisposers.length > 0 ? newDisposers : EMPTY_ARRAY,
            n: newNodes.length > 0 ? newNodes : EMPTY_ARRAY,
          } as IndexedItem;
        }

        if (key === oldSize) {
          append(...newNodes);
          indexedItems.push(indexedItem);
        } else {
          if (newNodes !== EMPTY_ARRAY) {
            const rightIndex = findIndexOfNodesToRight(indexedItems, key);
            if (rightIndex < 0) {
              append(...newNodes);
            } else {
              indexedItems[rightIndex]!.n[0]!.before(...newNodes);
            }
          }
          indexedItems.splice(key, 0, indexedItem);
        }

        return;
      }
      case COLLECTION_EMIT_TYPE_KEY_DELETE: {
        const { key, size } = message;

        const oldDisposers = indexedItems[key]!.d;
        if (oldDisposers !== EMPTY_ARRAY) {
          scheduleCleanup(() => dispose(oldDisposers));
        }
        for (const node of indexedItems[key]!.n) {
          parent.removeChild(node);
        }

        if (key === size) {
          indexedItems.length = size;
        } else {
          indexedItems.splice(key, 1);
        }

        return;
      }
      case COLLECTION_EMIT_TYPE_KEY_SWAP: {
        const [keyA, keyB] = message.keySwap;

        const aIndexedItem = indexedItems[keyA]!;
        const bIndexedItem = indexedItems[keyB]!;

        indexedItems[keyA] = bIndexedItem;
        indexedItems[keyB] = aIndexedItem;

        const aNodes = aIndexedItem.n;
        const bNodes = bIndexedItem.n;

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
            const rightOfBIndex = findIndexOfNodesToRight(indexedItems, keyB);
            if (rightOfBIndex < 0) {
              append(...aNodes);
            } else {
              indexedItems[rightOfBIndex]!.n[0]!.before(...aNodes);
            }
          }
        } else {
          const rightOfAIndex = findIndexOfNodesToRight(indexedItems, keyA);
          if (rightOfAIndex < keyB) {
            indexedItems[rightOfAIndex]!.n[0]!.before(...bNodes);
          }
        }

        return;
      }
      case LIST_EMIT_TYPE_APPEND: {
        const { oldSize, size } = message;

        const newNodes: ChildNode[] = [];
        const newValues = rawList.toArraySlice(oldSize);

        indexedItems.length = size;

        renderListItemsInto(
          oldSize,
          parent,
          newNodes,
          indexedItems,
          newValues,
          contextStore
        );

        append(...newNodes);

        return;
      }
      case COLLECTION_EMIT_TYPE_KEY_WRITE: {
        const { key } = message;

        const oldIndexedItem = indexedItems[key]!;
        const oldDisposers = oldIndexedItem.d;
        if (oldDisposers !== EMPTY_ARRAY) {
          scheduleCleanup(() => dispose(oldDisposers));
        }

        const oldNodes = oldIndexedItem.n;

        const newValue = rawList.at(key);

        if (newValue == null) {
          indexedItems[key] = EMPTY_ITEM;
        } else {
          let newDisposers: Disposer[] = [];
          let newNodes: ChildNode[] = [];
          renderInto(parent, newNodes, newDisposers, newValue, contextStore);

          newDisposers = newDisposers.length > 0 ? newDisposers : EMPTY_ARRAY;
          if (newNodes.length > 0) {
            if (oldNodes === EMPTY_ARRAY) {
              const rightIndex = findIndexOfNodesToRight(indexedItems, key);
              if (rightIndex < 0) {
                append(...newNodes);
              } else {
                indexedItems[rightIndex]!.n[0]!.before(...newNodes);
              }
            } else {
              oldNodes[0]!.before(...newNodes);
            }
          } else {
            newNodes = EMPTY_ARRAY;
          }
          indexedItems[key] = { d: newDisposers, n: newNodes } as IndexedItem;
        }

        for (const node of oldNodes) {
          parent.removeChild(node);
        }

        return;
      }
      case LIST_EMIT_TYPE_SPLICE: {
        const { start, deleteCount, addCount, oldSize, size } = message;

        if (deleteCount === oldSize && start === 0) {
          // Fast path for whole list replacement
          const oldIndexedItems = indexedItems;
          indexedItems = new Array(size);
          scheduleCleanup(() => disposeIndexed(oldIndexedItems));

          const newNodes: ChildNode[] = [];

          renderListItemsInto(
            0,
            parent,
            newNodes,
            indexedItems,
            rawList,
            contextStore
          );

          replaceChildren(...newNodes);
          return;
        }

        let deletedIndexedItems: IndexedItems;

        if (addCount === 0) {
          deletedIndexedItems = indexedItems.splice(start, deleteCount);
        } else {
          const addedIndexedItems: IndexedItems = new Array(addCount);
          const newValues = rawList.toArraySlice(start, start + addCount);
          const newNodes: ChildNode[] = [];

          renderListItemsInto(
            0,
            parent,
            newNodes,
            addedIndexedItems,
            newValues,
            contextStore
          );

          if (newNodes.length > 0) {
            const rightIndex = findIndexOfNodesToRight(indexedItems, start);
            if (rightIndex < 0) {
              append(...newNodes);
            } else {
              indexedItems[rightIndex]!.n[0]!.before(...newNodes);
            }
          }

          deletedIndexedItems = indexedItems.splice(
            start,
            deleteCount,
            ...addedIndexedItems
          );
        }

        if (deletedIndexedItems.length > 0) {
          scheduleCleanup(() => disposeIndexed(deletedIndexedItems));
        }
        for (const { n } of deletedIndexedItems) {
          for (const node of n) {
            parent.removeChild(node);
          }
        }

        return;
      }
      case LIST_EMIT_TYPE_REVERSE:
        indexedItems.reverse();

        for (const { n } of indexedItems) {
          append(...n);
        }
        break;
      case LIST_EMIT_TYPE_SORT:
        const { sortMap, size } = message;

        const oldIndexedItems = indexedItems;
        indexedItems = new Array(oldIndexedItems.length);

        for (let index = 0; index < size; index++) {
          const mappedIndex = sortMap[index]!;
          indexedItems[index] = oldIndexedItems[mappedIndex]!;
        }

        for (const { n } of indexedItems) {
          append(...n);
        }
        break;
      default: {
        throw new Error('Unhandled emit', { cause: message });
      }
    }
  }

  const listEmitDisposer = list[emitterKey](listChangeHandler);

  disposers.push(() => {
    listEmitDisposer();
    disposeIndexed(indexedItems);
  });
}

function disposeIndexed(indexedItems: IndexedItems) {
  for (const item of indexedItems) {
    for (const d of item.d) {
      d();
    }
  }
}

function findIndexOfNodesToRight(
  indexedNodes: IndexedItems,
  index: number
): number {
  for (let i = index + 1; i < indexedNodes.length; i++) {
    const nodes = indexedNodes[i]!.n;
    if (nodes !== EMPTY_ARRAY) {
      return i;
    }
  }
  return -1;
}
