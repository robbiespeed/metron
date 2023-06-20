import {
  emitterKey,
  isAtom,
  untracked,
  type Atom,
} from '@metron/core/particle';
import {
  NODE_TYPE_COMPONENT,
  NODE_TYPE_FRAGMENT,
  NODE_TYPE_INTRINSIC,
  type ComponentContextStore,
  type JsxProps,
  NODE_TYPE_CONTEXT_PROVIDER,
  NODE_TYPE_RENDER_CONTEXT,
  isJsxNode,
  type JsxNode,
  createContext,
} from '../node.js';
import { isIterable } from '../utils.js';
import {
  isAtomList,
  type AtomList,
  LIST_EMIT_TYPE_APPEND,
  LIST_EMIT_TYPE_SPLICE,
} from '@metron/core/list';
import {
  COLLECTION_EMIT_TYPE_CLEAR,
  COLLECTION_EMIT_TYPE_KEY_ADD,
  COLLECTION_EMIT_TYPE_KEY_DELETE,
  COLLECTION_EMIT_TYPE_KEY_SWAP,
  COLLECTION_EMIT_TYPE_KEY_WRITE,
} from '@metron/core/collection';

type Disposer = () => void;

interface DomRenderContextProps extends JsxProps {
  readonly root: Element;
  readonly children: unknown;
}

type JsxRender = {
  [key in JsxNode['nodeType']]: (
    parent: ParentNode,
    nodeContainer: ChildNode[],
    disposerContainer: Disposer[],
    value: Extract<JsxNode, { nodeType: key }>,
    contextStore: ComponentContextStore,
    isOnlyChild?: boolean
  ) => void;
};

const EVENT_HANDLER_PREFIX = 'on:';
const EVENT_HANDLER_PREFIX_LENGTH = EVENT_HANDLER_PREFIX.length;

export function render(
  { root, children }: DomRenderContextProps,
  contextStore: ComponentContextStore = {}
): Disposer {
  const nodeContainer: ChildNode[] = [];
  const disposerContainer: Disposer[] = [];

  renderInto(
    root,
    nodeContainer,
    disposerContainer,
    children,
    contextStore,
    true
  );

  root.replaceChildren(...nodeContainer);

  return () => {
    dispose(disposerContainer);
    disposerContainer.length = 0;
  };
}

const jsxRender: JsxRender = {
  [NODE_TYPE_COMPONENT](
    parent,
    nodeContainer,
    disposerContainer,
    component,
    contextStore,
    isOnlyChild
  ) {
    const { tag, props } = component;

    const componentContext = createContext(contextStore);

    const children = tag(props, componentContext);

    renderInto(
      parent,
      nodeContainer,
      disposerContainer,
      children,
      contextStore,
      isOnlyChild
    );
  },
  [NODE_TYPE_FRAGMENT](
    parent,
    nodeContainer,
    disposerContainer,
    { children },
    contextStore,
    isOnlyChild
  ) {
    renderInto(
      parent,
      nodeContainer,
      disposerContainer,
      children,
      contextStore,
      isOnlyChild
    );
  },
  [NODE_TYPE_INTRINSIC](
    parent,
    nodeContainer,
    disposerContainer,
    intrinsic,
    contextStore,
    isOnlyChild
  ) {
    const { children, ...props } = intrinsic.props;

    const element = document.createElement(intrinsic.tag);

    nodeContainer.push(element);

    for (const [key, value] of Object.entries(props)) {
      if (isAtom(value)) {
        if (key.startsWith(EVENT_HANDLER_PREFIX)) {
          const eventName = key.slice(EVENT_HANDLER_PREFIX_LENGTH);

          let eventHandler = untracked(value);
          if (typeof eventHandler === 'function') {
            element.addEventListener(eventName, eventHandler as () => void);
          } else if (eventHandler !== undefined) {
            throw new TypeError('Event handler must be a function');
          }

          disposerContainer.push(
            value[emitterKey](() => {
              if (eventHandler) {
                element.removeEventListener(
                  eventName,
                  eventHandler as () => void
                );
              }

              eventHandler = untracked(value);
              if (typeof eventHandler === 'function') {
                element.addEventListener(eventName, eventHandler as () => void);
              } else if (eventHandler !== undefined) {
                throw new TypeError('Event handler must be a function');
              }
            })
          );
        } else {
          const firstValue = untracked(value);
          if (firstValue !== undefined) {
            element.setAttribute(key, String(firstValue));
          }

          disposerContainer.push(
            value[emitterKey](() => {
              const newValue = untracked(value);
              if (newValue === undefined) {
                element.removeAttribute(key);
              } else {
                element.setAttribute(key, String(newValue));
              }
            })
          );
        }
      } else if (key.startsWith(EVENT_HANDLER_PREFIX)) {
        if (typeof value === 'function') {
          const eventName = key.slice(EVENT_HANDLER_PREFIX_LENGTH);
          element.addEventListener(eventName, value as () => void);
        } else {
          throw new TypeError('Event handler must be a function');
        }
      } else if (value !== undefined) {
        element.setAttribute(key, String(value));
      }
    }

    const childNodeContainer: ChildNode[] = [];

    renderInto(
      element,
      childNodeContainer,
      disposerContainer,
      children,
      contextStore,
      true
    );

    element.append(...childNodeContainer);
  },
  [NODE_TYPE_CONTEXT_PROVIDER](
    parent,
    nodeContainer,
    disposerContainer,
    intrinsic,
    contextStore,
    isOnlyChild
  ) {
    throw new Error('Not Implemented');
  },
  [NODE_TYPE_RENDER_CONTEXT](
    parent,
    nodeContainer,
    disposerContainer,
    intrinsic,
    contextStore,
    isOnlyChild
  ) {
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
  nodeContainer: ChildNode[],
  disposerContainer: Disposer[],
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
      nodeContainer,
      disposerContainer,
      value as any,
      contextStore,
      isOnlyChild
    );
  } else if (isIterable(value) && typeof value === 'object') {
    for (const child of value) {
      renderInto(parent, nodeContainer, disposerContainer, child, contextStore);
    }
  } else if (isAtom(value)) {
    if (isOnlyChild) {
      renderOnlyChildAtomInto(
        parent,
        nodeContainer,
        disposerContainer,
        value,
        contextStore
      );
    } else {
      throw new Error('Not implemented');
    }
  } else {
    nodeContainer.push(document.createTextNode(String(value)));
  }
}

function renderOnlyChildAtomInto(
  parent: ParentNode,
  nodeContainer: ChildNode[],
  disposerContainer: Disposer[],
  atom: Atom,
  contextStore: ComponentContextStore
): void {
  if (isAtomList(atom)) {
    return renderOnlyChildAtomListInto(
      parent,
      nodeContainer,
      disposerContainer,
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
  nodeContainer.push(text);

  disposerContainer.push(
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
  nodeContainer: ChildNode[],
  disposerContainer: Disposer[],
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
    nodeContainer.push(...childNodeContainer);
  }

  const listEmitTerminator = list[emitterKey]((message) => {
    switch (message.type) {
      case COLLECTION_EMIT_TYPE_CLEAR: {
        const oldIndexedDisposers = indexedDisposers.slice();
        window.requestIdleCallback(() => disposeIndexed(oldIndexedDisposers));
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
          window.requestIdleCallback(() => dispose(oldDisposers));
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
          window.requestIdleCallback(() => dispose(oldDisposers));
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
          window.requestIdleCallback(() => disposeIndexed(oldIndexedDisposers));
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
          window.requestIdleCallback(() =>
            disposeIndexed(deletedIndexedDisposers)
          );
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

  disposerContainer.push(() => {
    listEmitTerminator();
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
