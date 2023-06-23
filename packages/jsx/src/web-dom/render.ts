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
} from '@metron/core/list.js';
import {
  emitterKey,
  isAtom,
  untracked,
  type Atom,
} from '@metron/core/particle.js';
import {
  scheduleCleanup,
  setCleanupScheduler,
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
import { createEffect } from '@metron/core/effect.js';

setCleanupScheduler(window.requestIdleCallback);

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

const jsxRender: JsxRender = {
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
      let [keySpecifier, keyName] = key.split(':', 2) as [string, string];
      if (keySpecifier === key) {
        keyName = keySpecifier;
        keySpecifier = 'attr';
      }
      switch (keySpecifier) {
        case 'prop':
          if (isAtom(value)) {
            disposers.push(
              createEffect(value, () => {
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
              createEffect(value, () => {
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

function renderInto(
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

  if (isJsxNode(value)) {
    jsxRender[value.nodeType](
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
  } else if (isAtom(value)) {
    if (isOnlyChild) {
      renderOnlyChildAtomInto(parent, nodes, disposers, value, contextStore);
    } else {
      throw new Error('Not implemented');
    }
  } else {
    // @ts-ignore createTextNode casts to string
    nodes.push(document.createTextNode(value));
  }
}

function renderOnlyChildAtomInto(
  parent: ParentNode,
  nodes: ChildNode[],
  disposers: Disposer[],
  atom: Atom,
  contextStore: ComponentContextStore
): void {
  if (isAtomList(atom)) {
    return renderOnlyChildAtomListInto(
      parent,
      nodes,
      disposers,
      atom,
      contextStore
    );
  }

  const firstValue = untracked(atom);

  if (firstValue !== null && typeof firstValue === 'object') {
    throw new Error('Not implemented');
  }

  const text = document.createTextNode(
    firstValue === undefined ? '' : String(firstValue)
  );
  nodes.push(text);

  disposers.push(
    atom[emitterKey](() => {
      const newValue = untracked(atom);
      text.textContent = newValue === undefined ? '' : String(newValue);
    })
  );
}

type NonEmptyChildNodes = [ChildNode, ...ChildNode[]];
type IndexedEmpty = [];
type IndexedNodes = (NonEmptyChildNodes | IndexedEmpty)[];
type IndexedDisposers = Disposer[][];

const EMPTY_ARRAY: IndexedEmpty = [];

function renderOnlyChildAtomListInto(
  parent: ParentNode,
  firstNodes: ChildNode[],
  disposers: Disposer[],
  list: AtomList<unknown>,
  contextStore: ComponentContextStore
) {
  const indexedDisposers: IndexedDisposers = [];
  const indexedNodes: IndexedNodes = [];

  const rawList = untracked(list);

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

  const listEmitDisposer = list[emitterKey]((message) => {
    switch (message.type) {
      case COLLECTION_EMIT_TYPE_CLEAR: {
        const oldIndexedDisposers = indexedDisposers.slice();
        scheduleCleanup(() => disposeIndexed(oldIndexedDisposers));
        parent.replaceChildren();
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
          parent.append(...newNodes);
          indexedDisposers.push(newDisposers);
          indexedNodes.push(newNodes as []);
        } else {
          if (newNodes !== EMPTY_ARRAY) {
            const rightIndex = findIndexOfNodesToRight(indexedNodes, key);
            if (rightIndex < 0) {
              parent.append(...newNodes);
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
            swapNodeLists(parent, aNodes, bNodes);
          } else {
            const rightOfBIndex = findIndexOfNodesToRight(indexedNodes, keyB);
            if (rightOfBIndex < 0) {
              parent.append(...aNodes);
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

        parent.append(...newNodes);

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
              parent.append(...newNodes);
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

          parent.replaceChildren(...newNodes);
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
              parent.append(...newNodes);
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
  });

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

function swapNodeLists(
  parent: ParentNode,
  aNodes: NonEmptyChildNodes,
  bNodes: NonEmptyChildNodes
) {
  const firstA = aNodes[0];
  const lastB = bNodes.at(-1)!;
  const afterB = lastB.nextSibling;
  const beforeA = firstA.previousSibling;

  if (afterB === null) {
    parent.append(...aNodes);
  } else {
    afterB.before(...aNodes);
  }
  if (beforeA === null) {
    parent.prepend(...bNodes);
  } else {
    beforeA.after(...bNodes);
  }
}

// TODO: move to shared package
function assertOverride<T>(value: unknown): asserts value is T {}
