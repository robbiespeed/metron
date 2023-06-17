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
import { isAtomList, type AtomList } from '@metron/core/list';
import { reconcileArrays } from './dom-helpers.js';

type Disposer = () => void;

interface DomRenderContextProps extends JsxProps {
  readonly root: Element;
  readonly children: unknown;
}

interface RenderContainer {
  parent: ParentNode;
  nodes: ChildNode[];
  disposers: Disposer[];
}

type JsxRender = {
  [key in JsxNode['nodeType']]: (
    container: RenderContainer,
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
  const renderContainer = createRenderContainer(root);

  renderInto(renderContainer, children, contextStore, true);

  const { disposers, nodes } = renderContainer;

  root.replaceChildren(...nodes);

  return () => {
    dispose(disposers);
    disposers.length = 0;
  };
}

const jsxRender: JsxRender = {
  [NODE_TYPE_COMPONENT](container, component, contextStore, isOnlyChild) {
    const { tag, props } = component;

    const componentContext = createContext(contextStore);

    const children = tag(props, componentContext);

    renderInto(container, children, contextStore, isOnlyChild);
  },
  [NODE_TYPE_FRAGMENT](container, { children }, contextStore, isOnlyChild) {
    renderInto(container, children, contextStore, isOnlyChild);
  },
  [NODE_TYPE_INTRINSIC](container, intrinsic, contextStore, isOnlyChild) {
    const { children, ...props } = intrinsic.props;

    const element = document.createElement(intrinsic.tag);

    const { disposers } = container;

    container.nodes.push(element);

    for (const [key, value] of Object.entries(props)) {
      if (isAtom(value)) {
        if (key.startsWith(EVENT_HANDLER_PREFIX)) {
          const eventName = key.slice(EVENT_HANDLER_PREFIX_LENGTH);

          let eventHandler = untracked(value);
          if (typeof eventHandler === 'function') {
            element.addEventListener(eventName, eventHandler as () => void);
          } else {
            eventHandler = undefined;
          }

          disposers.push(
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
              } else {
                eventHandler = undefined;
              }
            })
          );
        } else {
          const firstValue = untracked(value);
          if (firstValue !== undefined) {
            element.setAttribute(key, String(firstValue));
          }

          disposers.push(
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
        }
      } else if (value !== undefined) {
        element.setAttribute(key, String(value));
      }
    }

    const childContainer = createRenderContainer(element, disposers);

    renderInto(childContainer, children, contextStore, true);

    element.append(...childContainer.nodes);
  },
  [NODE_TYPE_CONTEXT_PROVIDER](
    container,
    component,
    contextStore,
    isOnlyChild
  ) {
    throw new Error('Not Implemented');
  },
  [NODE_TYPE_RENDER_CONTEXT](container, component, contextStore, isOnlyChild) {
    throw new Error('Not Implemented');
  },
};

function dispose(disposers: Disposer[]): void {
  for (const d of disposers) {
    d();
  }
}

function createRenderContainer(
  parent: ParentNode,
  disposers: Disposer[] = [],
  nodes: ChildNode[] = []
): RenderContainer {
  return {
    parent,
    // Could adding scheduledDisposers help with perf?
    disposers,
    nodes,
  };
}

function renderInto(
  container: RenderContainer,
  value: unknown,
  contextStore: ComponentContextStore,
  isOnlyChild = false
): void {
  if (value === undefined) {
    return;
  }

  if (isJsxNode(value)) {
    jsxRender[value.nodeType](
      container,
      value as any,
      contextStore,
      isOnlyChild
    );
  } else if (isIterable(value) && typeof value === 'object') {
    for (const child of value) {
      renderInto(container, child, contextStore);
    }
  } else if (isAtom(value)) {
    if (isOnlyChild) {
      renderOnlyChildAtomInto(container, value, contextStore);
    } else {
      throw new Error('Not implemented');
    }
  } else {
    container.nodes.push(document.createTextNode(String(value)));
  }
}

function renderOnlyChildAtomInto(
  container: RenderContainer,
  atom: Atom,
  contextStore: ComponentContextStore
): void {
  if (isAtomList(atom)) {
    return renderOnlyChildAtomListInto(container, atom, contextStore);
  }

  const firstValue = untracked(atom);

  if (firstValue !== null && typeof firstValue === 'object') {
    throw new Error('Not implemented');
  }

  const text = document.createTextNode(
    firstValue === undefined ? '' : String(firstValue)
  );
  container.nodes.push(text);

  container.disposers.push(
    atom[emitterKey](() => {
      const newValue = untracked(atom);
      text.textContent = newValue === undefined ? '' : String(newValue);
    })
  );
}

type NonEmptyChildNodes = [ChildNode, ...ChildNode[]];

type IndexedNodes = (undefined | NonEmptyChildNodes)[];
type IndexedDisposers = (undefined | Disposer[])[];

function renderOnlyChildAtomListInto(
  container: RenderContainer,
  list: AtomList<unknown>,
  contextStore: ComponentContextStore
) {
  let indexedDisposers: IndexedDisposers = [];
  let indexedNodes: IndexedNodes = [];

  const { parent, nodes, disposers } = container;

  const rawList = untracked(list);
  let oldValues = rawList.toArray();
  let valueIndexes = new Map<unknown, number>();

  for (let i = oldValues.length - 1; i >= 0; i--) {
    const value = oldValues[i];
    valueIndexes.set(value, i);
    const childContainer = createRenderContainer(parent);
    renderInto(childContainer, value, contextStore);
    const { disposers: childDisposers, nodes: childNodes } = childContainer;
    if (childDisposers.length > 0) {
      indexedDisposers[i] = childDisposers;
    }
    if (childNodes.length > 0) {
      indexedNodes[i] = childNodes as NonEmptyChildNodes;
    }
  }

  for (const childNodes of indexedNodes) {
    if (childNodes !== undefined) {
      nodes.push(...childNodes);
    }
  }

  const listEmitTerminator = list[emitterKey](() => {
    const newValues = rawList.toArray();
    const newValueIndexes = new Map<unknown, number>();
    const newIndexedNodes = [];
    const newIndexedDesposers = [];

    for (let i = newValues.length - 1; i >= 0; i--) {
      const value = newValues[i];
      const oldIndex = valueIndexes.get(value);
      newValueIndexes.set(value, i);
      if (oldIndex === undefined) {
        const childContainer = createRenderContainer(parent);
        renderInto(childContainer, value, contextStore);
        const { disposers: childDisposers, nodes: childNodes } = childContainer;
        if (childDisposers.length > 0) {
          newIndexedDesposers[i] = childDisposers;
        }
        if (childNodes.length > 0) {
          newIndexedNodes[i] = childNodes as NonEmptyChildNodes;
        }
      } else {
        newIndexedDesposers[i] = indexedDisposers[oldIndex];
        newIndexedNodes[i] = indexedNodes[oldIndex];
        valueIndexes.delete(value);
      }
    }

    // Despose all non recycled disposers
    const scheduledDisposers: Disposer[] = [];
    for (const oldIndex of valueIndexes.values()) {
      const possibleDisposers = indexedDisposers[oldIndex];
      if (possibleDisposers !== undefined) {
        scheduledDisposers.push(...possibleDisposers);
      }
    }
    if (scheduledDisposers.length) {
      window.requestIdleCallback(() => dispose(scheduledDisposers));
    }

    const oldNodes: ChildNode[] = [];
    const newNodes: ChildNode[] = [];

    for (const childNodes of indexedNodes) {
      if (childNodes !== undefined) {
        oldNodes.push(...childNodes);
      }
    }
    for (const childNodes of newIndexedNodes) {
      if (childNodes !== undefined) {
        newNodes.push(...childNodes);
      }
    }

    if (oldNodes.length && newNodes.length) {
      reconcileArrays(parent, oldNodes, newNodes);
    } else {
      parent.replaceChildren(...newNodes);
    }

    valueIndexes = newValueIndexes;
    indexedDisposers = newIndexedDesposers;
    indexedNodes = newIndexedNodes;
  });

  disposers.push(() => {
    listEmitTerminator();
    for (const possibleDisposers of indexedDisposers) {
      if (possibleDisposers !== undefined) {
        dispose(possibleDisposers);
      }
    }
  });
}
