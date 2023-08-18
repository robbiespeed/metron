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
import { emitterKey, isAtom, untracked } from 'metron-core/particle.js';
import {
  scheduleCleanup,
  setCleanupScheduler,
  setMicroTaskScheduler,
} from 'metron-core/schedulers.js';
import {
  NODE_TYPE_COMPONENT,
  NODE_TYPE_CONTEXT_PROVIDER,
  NODE_TYPE_INTRINSIC,
  isJSXNode,
  type JSXNode,
  type JSXIntrinsicNode,
} from '../node.js';
import {
  type JSXContext,
  createRootContext,
  createChildContext,
} from '../context.js';
import { isIterable, assertOverride, dispose } from '../utils.js';
import { EVENT_DATA_KEY_PREFIX, EVENT_KEY_PREFIX } from './events.js';
import type { DelegatedEventTarget, DelegatedEventParams } from './events.js';
import { renderSubscribe, runAndRenderSubscribe } from './shared.js';

// TODO move to an init function
setCleanupScheduler(requestIdleCallback);
setMicroTaskScheduler(queueMicrotask);

interface DomRenderContextProps {
  readonly root: ParentNode;
  readonly children: unknown;
}

type NodeAppend = (node: ChildNode) => void;

type JSXRender = {
  [key in JSXNode['nodeType']]: (
    parent: ParentNode | null,
    append: NodeAppend,
    value: Extract<JSXNode, { nodeType: key }>,
    context: JSXContext
  ) => void;
};

export const EVENT_HANDLER_PREFIX = 'on:';
export const EVENT_HANDLER_PREFIX_LENGTH = EVENT_HANDLER_PREFIX.length;

export function render(
  { root, children }: DomRenderContextProps,
  context?: JSXContext
): Disposer {
  if (children == null) {
    root.replaceChildren();
    return () => {};
  }

  const append = root.appendChild.bind(root);
  const disposers: Disposer[] = [];

  const addDisposer = disposers.push.bind(disposers);

  context =
    context === undefined
      ? createRootContext(addDisposer)
      : { ...context, addDisposer };

  renderInto(root, append, children, context);

  return () => {
    dispose(disposers);
    disposers.length = 0;
  };
}

/**
 * @private
 */
export const jsxRender: JSXRender = {
  [NODE_TYPE_COMPONENT](parent, append, component, context) {
    const { tag, props } = component;

    const children = tag(props, context);

    if (children != null) {
      renderInto(parent, append, children, context);
    }
  },
  [NODE_TYPE_INTRINSIC]: renderIntrinsic,
  [NODE_TYPE_CONTEXT_PROVIDER](
    parent,
    append,
    { assignments, children },
    context
  ) {
    const childContext = createChildContext(context, assignments);
    if (children != null) {
      renderInto(parent, append, children, childContext);
    }
  },
};

export function renderIntrinsic(
  parent: ParentNode | null,
  append: NodeAppend,
  intrinsic: JSXIntrinsicNode,
  context: JSXContext
): void {
  const { children, ...props } = intrinsic.props as Record<string, unknown>;

  const element = document.createElement(intrinsic.tag);

  const { addDisposer } = context;

  for (const [fullKey, value] of Object.entries(props)) {
    if (value === undefined) {
      continue;
    }
    let [keySpecifier, key] = fullKey.split(':', 2) as [string, string];
    if (keySpecifier === fullKey) {
      key = keySpecifier;
      keySpecifier = 'attr';
    }
    switch (keySpecifier) {
      case 'setup':
        (value as Function)(element);
        continue;
      case 'prop': {
        if (isAtom(value)) {
          addDisposer(
            runAndRenderSubscribe(value, () => {
              // Expect the user knows what they are doing
              (element as any)[key] = untracked(value);
            })
          );
        } else {
          // Expect the user knows what they are doing
          (element as any)[key] = value;
        }
        continue;
      }
      case 'attr': {
        if (isAtom(value)) {
          const firstValue = untracked(value);

          if (firstValue === true) {
            element.toggleAttribute(key, true);
          } else if (firstValue !== undefined && firstValue !== false) {
            // setAttribute casts to string
            element.setAttribute(key, firstValue as any);
          }

          addDisposer(
            renderSubscribe(value, () => {
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
          element.toggleAttribute(key, true);
        } else if (value !== false) {
          element.setAttribute(key, value as string);
        }
        continue;
      }
      case 'on': {
        if (value === undefined) {
          continue;
        }

        assertOverride<EventListener>(value);
        element.addEventListener(key, value, { passive: true });

        continue;
      }
      case 'delegate': {
        if (value === undefined) {
          continue;
        }

        // TODO: Dev mode only, check if key is in delegatedEventTypes and warn if not

        assertOverride<DelegatedEventParams<unknown, EventTarget>>(value);
        assertOverride<DelegatedEventTarget>(element);

        element[`${EVENT_KEY_PREFIX}:${key}`] = value.handler;
        element[`${EVENT_DATA_KEY_PREFIX}:${key}`] = value.data;

        continue;
      }
      default:
        throw new TypeError(`Unsupported specifier "${keySpecifier}"`);
    }
  }

  if (children != null) {
    renderInto(element, element.appendChild.bind(element), children, context);
  }

  append(element);
}

/**
 * @private
 */
export function renderInto(
  parent: ParentNode | null,
  append: NodeAppend,
  value: {},
  context: JSXContext
): void {
  if (typeof value === 'object') {
    if (isJSXNode(value)) {
      return jsxRender[value.nodeType](parent, append, value as any, context);
    } else if (isIterable(value) && typeof value === 'object') {
      for (const child of value) {
        if (child != null) {
          renderInto(null, append, child, context);
        }
      }
      return;
    } else if (isAtomList(value)) {
      return renderAtomListInto(parent, append, value, context);
    } else if (isAtom(value)) {
      const firstValue = untracked(value);

      const text = document.createTextNode(
        // createTextNode casts param to string
        firstValue === undefined ? '' : (firstValue as any)
      );
      append(text);

      context.addDisposer(
        renderSubscribe(value, () => {
          const newValue = untracked(value);
          // Data casts to string
          text.data = newValue === undefined ? '' : (newValue as any);
        })
      );
      return;
    } else if (value instanceof Element) {
      append(value);
      return;
    }
  }
  // createTextNode casts to string
  append(document.createTextNode(value as any));
}

interface Bounds {
  s: ChildNode;
  e: ChildNode;
}

function createListDomOperators(
  initAppend: NodeAppend,
  parent: ParentNode | null
) {
  let bounds: Bounds | undefined;

  let append: (node: ChildNode) => void;
  let clearNodes: () => void;
  let insertBefore: (node: ChildNode, ref: ChildNode | null) => void;
  let prepend: (node: ChildNode) => void;
  let removeChild: (node: ChildNode) => void;
  if (parent === null) {
    const s = document.createTextNode('');
    const e = document.createTextNode('');
    bounds = { s, e };
    initAppend(s);

    let range: Range | undefined;

    function initRange() {
      range = document.createRange();
      range.setStartAfter(s);
      range.setEndBefore(e);
      return range;
    }

    append = e.before.bind(e);
    clearNodes = () => {
      (range ?? initRange()).deleteContents();
    };
    insertBefore = (node, ref) => {
      if (ref === null) {
        append(node);
      } else {
        ref.before(node);
      }
    };
    prepend = s.after.bind(s);
    removeChild = (node) => node.remove();
  } else {
    append = parent.appendChild.bind(parent);
    clearNodes = parent.replaceChildren.bind(parent);
    insertBefore = parent.insertBefore.bind(parent);
    prepend = parent.prepend.bind(parent);
    removeChild = parent.removeChild.bind(parent);
  }

  const swapNodeRanges = (a: Bounds, b: Bounds) => {
    const firstA = a.s;
    const lastA = a.e;
    const firstB = b.s;
    const lastB = b.e;
    const afterB = lastB.nextSibling;

    if (firstA === lastA && firstB === lastB) {
      firstA.replaceWith(firstB);
      insertBefore(firstA, afterB);
      return;
    }

    let next: ChildNode | null;
    if (lastA !== firstB.previousSibling) {
      next = firstB;
      while (next !== null) {
        const node: ChildNode = next;
        insertBefore(node, firstA);
        next = node === lastB ? null : next.nextSibling;
      }
    }

    next = firstA;
    while (next !== null) {
      const node: ChildNode = next;
      insertBefore(node, afterB);
      next = node === lastA ? null : next.nextSibling;
    }
  };

  const appendRange = ({ s, e }: Bounds) => {
    let next: ChildNode | null = s;
    while (next !== null) {
      const node: ChildNode = next;
      append(node);
      next = node === e ? null : next.nextSibling;
    }
  };

  const insertRangeBeforeNode = (
    { s, e }: Bounds,
    beforeRef: ChildNode | null
  ) => {
    let next: ChildNode | null = s;
    while (next !== null) {
      const node: ChildNode = next;
      insertBefore(node, beforeRef);
      next = node === e ? null : next.nextSibling;
    }
  };

  const removeUntil = (s: ChildNode, e?: ChildNode) => {
    let next: ChildNode | null = s;
    while (next !== null) {
      const node: ChildNode = next;
      removeChild(node);
      next = node === e ? null : next.nextSibling;
    }
  };

  return {
    bounds,
    clearNodes,
    append,
    prepend,
    swapNodeRanges,
    appendRange,
    insertRangeBeforeNode,
    removeUntil,
  };
}

type Empty = [];
type NonEmptyIndexedItem = { d: Disposer[]; s: ChildNode; e: ChildNode };
type EmptyIndexedItem = { d: Disposer[]; s: undefined; e: undefined };
type IndexedItem = NonEmptyIndexedItem | EmptyIndexedItem;
type IndexedItems = IndexedItem[];

const EMPTY_ARRAY: Empty = [];
const EMPTY_ITEM: EmptyIndexedItem = Object.freeze({
  d: EMPTY_ARRAY,
  s: undefined,
  e: undefined,
});

// TODO: instead of passing in parent and creating dom operators, require that renderAtomListInto be passed dom operators directly
export function renderAtomListInto(
  parent: ParentNode | null,
  initAppend: NodeAppend,
  list: AtomList<unknown>,
  context: JSXContext
) {
  const {
    bounds,
    clearNodes,
    append,
    swapNodeRanges,
    appendRange,
    insertRangeBeforeNode,
    removeUntil,
  } = createListDomOperators(initAppend, parent);

  const rawList = untracked(list);
  let indexedItems: IndexedItems = new Array(rawList.size);

  let indexedItem: IndexedItem = EMPTY_ITEM;

  let innerIndexedAppend = initAppend;

  function indexedAppend(node: ChildNode) {
    indexedItem.s ??= node;
    indexedItem.e = node;
    innerIndexedAppend(node);
  }

  // TODO: bench reusing
  // let nextDisposerContainer: Disposer[] = [];

  function renderValueToIndex(value: unknown, i: number) {
    if (value == null) {
      indexedItems[i] = EMPTY_ITEM;
    } else {
      const childDisposers: Disposer[] = [];
      indexedItems[i] = indexedItem = {
        d: childDisposers,
        s: undefined,
        e: undefined,
      };
      renderInto(null, indexedAppend, value, {
        ...context,
        addDisposer: childDisposers.push.bind(childDisposers),
      });
    }
  }

  let i = 0;
  for (const value of rawList) {
    renderValueToIndex(value, i);
    i++;
  }
  indexedItem = EMPTY_ITEM;
  if (bounds !== undefined) {
    initAppend(bounds.e);
  }
  innerIndexedAppend = append;

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

        if (key === oldSize) {
          // Append
          if (value == null) {
            indexedItems.push(EMPTY_ITEM);
            return;
          }

          const newDisposers: Disposer[] = [];
          indexedItem = {
            d: newDisposers,
            s: undefined,
            e: undefined,
          } as IndexedItem;

          renderInto(null, indexedAppend, value, {
            ...context,
            addDisposer: newDisposers.push.bind(newDisposers),
          });

          indexedItems.push(indexedItem);
        } else {
          // Splice
          if (value == null) {
            indexedItems.splice(key, 0, EMPTY_ITEM);
            return;
          }

          const newDisposers: Disposer[] = [];
          indexedItem = {
            d: newDisposers,
            s: undefined,
            e: undefined,
          } as IndexedItem;

          const rightIndex = findIndexOfNodesToRight(indexedItems, key);
          if (rightIndex < 0) {
            renderInto(null, indexedAppend, value, {
              ...context,
              addDisposer: newDisposers.push.bind(newDisposers),
            });
          } else {
            const rightNode = indexedItems[rightIndex]!.s!;
            innerIndexedAppend = rightNode.before.bind(rightNode);
            renderInto(null, indexedAppend, value, {
              ...context,
              addDisposer: newDisposers.push.bind(newDisposers),
            });
            innerIndexedAppend = append;
          }

          indexedItems.splice(key, 0, indexedItem);
        }

        indexedItem = EMPTY_ITEM;
        return;
      }
      case COLLECTION_EMIT_TYPE_KEY_DELETE: {
        const { key, size } = message;

        const oldIndexedItem = indexedItems[key]!;
        const oldDisposers = oldIndexedItem.d;
        if (oldDisposers !== EMPTY_ARRAY) {
          scheduleCleanup(() => dispose(oldDisposers));
        }
        const s = oldIndexedItem.s;
        if (s !== undefined) {
          removeUntil(s, oldIndexedItem.e);
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

        if (aIndexedItem === bIndexedItem) {
          // If A and B are the same they must both be EMPTY_ITEM
          return;
        }

        const aStart = aIndexedItem.s;
        if (aStart !== undefined) {
          const bStart = bIndexedItem.s;
          if (bStart !== undefined) {
            swapNodeRanges(aIndexedItem, bIndexedItem);
          } else {
            const rightOfBIndex = findIndexOfNodesToRight(indexedItems, keyB);
            if (rightOfBIndex < 0) {
              appendRange(aIndexedItem);
            } else {
              insertRangeBeforeNode(
                aIndexedItem,
                indexedItems[rightOfBIndex]!.s!
              );
            }
          }
        } else {
          assertOverride<NonEmptyIndexedItem>(bIndexedItem);
          const rightOfAIndex = findIndexOfNodesToRight(indexedItems, keyA);
          if (rightOfAIndex < keyB) {
            insertRangeBeforeNode(
              bIndexedItem,
              indexedItems[rightOfAIndex]!.s!
            );
          }
        }

        indexedItems[keyA] = bIndexedItem;
        indexedItems[keyB] = aIndexedItem;

        return;
      }
      case COLLECTION_EMIT_TYPE_KEY_WRITE: {
        const { key } = message;

        indexedItem = indexedItems[key]!;
        const oldStart = indexedItem.s;
        const oldEnd = indexedItem.e;
        const oldDisposers = indexedItem.d;
        if (oldDisposers !== EMPTY_ARRAY) {
          scheduleCleanup(() => dispose(oldDisposers));
        }

        const newValue = rawList.at(key);

        if (newValue == null) {
          indexedItems[key] = EMPTY_ITEM;
        } else {
          let newDisposers: Disposer[] = [];
          indexedItem.e = indexedItem.s = undefined;

          const rightIndex = findIndexOfNodesToRight(indexedItems, key);
          if (rightIndex < 0) {
            renderInto(null, indexedAppend, newValue, {
              ...context,
              addDisposer: newDisposers.push.bind(newDisposers),
            });
          } else {
            const rightNode = indexedItems[rightIndex]!.s!;
            innerIndexedAppend = rightNode.before.bind(rightNode);
            renderInto(null, indexedAppend, newValue, {
              ...context,
              addDisposer: newDisposers.push.bind(newDisposers),
            });
            innerIndexedAppend = append;
          }
        }

        if (oldStart !== undefined) {
          removeUntil(oldStart, oldEnd);
        }

        indexedItem = EMPTY_ITEM;
        return;
      }
      case LIST_EMIT_TYPE_APPEND: {
        const { oldSize, size } = message;

        const newValues = rawList.toArraySlice(oldSize);

        indexedItems.length = size;

        for (let i = oldSize, ni = 0; i < size; i++, ni++) {
          renderValueToIndex(newValues[ni], i);
        }
        indexedItem = EMPTY_ITEM;
        return;
      }
      case LIST_EMIT_TYPE_SPLICE: {
        const { start, deleteCount, addCount, oldSize, size } = message;

        if (deleteCount === oldSize && start === 0) {
          // Fast path for whole list replacement
          const oldIndexedItems = indexedItems;
          indexedItems = new Array(size);
          scheduleCleanup(() => disposeIndexed(oldIndexedItems));

          clearNodes();

          let i = 0;
          for (const value of rawList) {
            renderValueToIndex(value, i);
            i++;
          }
          indexedItem = EMPTY_ITEM;
          return;
        }

        let deletedIndexedItems: IndexedItems;

        if (addCount === 0) {
          deletedIndexedItems = indexedItems.splice(start, deleteCount);
        } else {
          const savedIndexedItems = indexedItems;
          indexedItems = new Array(addCount);
          const newValues = rawList.toArraySlice(start, start + addCount);

          const rightIndex = findIndexOfNodesToRight(indexedItems, start);
          if (rightIndex < 0) {
            for (let i = 0; i < addCount; i++) {
              renderValueToIndex(newValues[i], i);
            }
          } else {
            const rightNode = indexedItems[rightIndex]!.s!;
            innerIndexedAppend = rightNode.before.bind(rightNode);
            for (let i = 0; i < newValues.length; i++) {
              renderValueToIndex(newValues[i], i);
            }
            innerIndexedAppend = append;
          }
          indexedItem = EMPTY_ITEM;

          deletedIndexedItems = savedIndexedItems.splice(
            start,
            deleteCount,
            ...indexedItems
          );
          indexedItems = savedIndexedItems;
        }

        if (deletedIndexedItems.length > 0) {
          scheduleCleanup(() => disposeIndexed(deletedIndexedItems));
        }

        for (const { s, e } of deletedIndexedItems) {
          if (s !== undefined) {
            removeUntil(s, e);
          }
        }

        return;
      }
      case LIST_EMIT_TYPE_REVERSE:
        indexedItems.reverse();

        for (const item of indexedItems) {
          if (item.s !== undefined) {
            appendRange(item);
          }
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

        for (const item of indexedItems) {
          if (item.s !== undefined) {
            appendRange(item);
          }
        }
        break;
      default: {
        throw new Error('Unhandled emit', { cause: message });
      }
    }
  }

  const listEmitDisposer = list[emitterKey].subscribe(listChangeHandler);

  context.addDisposer(() => {
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
    const node = indexedNodes[i]!.s;
    if (node !== undefined) {
      return i;
    }
  }
  return -1;
}
