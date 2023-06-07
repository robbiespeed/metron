import {
  emitterKey,
  isAtom,
  untracked,
  type Atom,
} from '@metron/core/particle.js';
import {
  COLLECTION_EMIT_TYPE_ALL_CHANGE,
  COLLECTION_EMIT_TYPE_KEY_CHANGE,
  COLLECTION_EMIT_TYPE_SLICE_CHANGE,
  isAtomCollection,
  type AtomCollection,
  type AtomCollectionEmitChange,
  type RawAtomCollection,
} from '@metron/core/collection.js';

import {
  createContext,
  renderNode,
  type ComponentNode,
  type IntrinsicNode,
  type RenderContext,
  type ComponentContextStore,
  isNode,
} from '../node.js';
import { isIterable } from '../utils.js';

type RenderedResult = (Element | Text | undefined) | RenderedResult[];

export const domRenderContext = {
  renderComponent(element, contextStore): RenderedResult {
    const { tag, props } = element as ComponentNode;
    const componentContext = createContext(contextStore);

    const children = tag(props, componentContext);

    return renderChildren(children, contextStore, this);
  },
  render(element, contextStore): RenderedResult {
    if (isAtom(element)) {
      const renderedFragment = document.createDocumentFragment();
      replaceRenderAtom(element, renderedFragment, contextStore, this);
      return renderedFragment;
    } else if (isIterable(element) && typeof element === 'object') {
      const renderedFragment = document.createDocumentFragment();
      replaceRenderIterable(element, renderedFragment, contextStore, this);
      return renderedFragment;
    } else {
      return document.createTextNode(String(element));
    }
  },
  renderIntrinsic(element, contextStore): Element {
    const { tag, props } = element as IntrinsicNode;
    const { children, ...restProps } = props;

    const renderedElement = document.createElement(tag);

    for (const [key, value] of Object.entries(restProps)) {
      if (isAtom(value)) {
        if (key.startsWith('on')) {
          const eventName = key.slice(2).toLowerCase();

          let eventHandler = untracked(value);
          if (typeof eventHandler === 'function') {
            renderedElement.addEventListener(
              eventName,
              eventHandler as () => void
            );
          } else {
            eventHandler = undefined;
          }

          value[emitterKey](() => {
            if (eventHandler) {
              renderedElement.removeEventListener(
                eventName,
                eventHandler as () => void
              );
            }

            eventHandler = untracked(value);
            if (typeof eventHandler === 'function') {
              renderedElement.addEventListener(
                eventName,
                eventHandler as () => void
              );
            } else {
              eventHandler = undefined;
            }
          });
        } else {
          renderedElement.setAttribute(key, String(untracked(value)));

          value[emitterKey](() => {
            renderedElement.setAttribute(key, String(untracked(value)));
          });
        }
      } else {
        if (key.startsWith('on')) {
          const eventHandler = value;
          if (typeof eventHandler === 'function') {
            const eventName = key.slice(2).toLowerCase();
            renderedElement.addEventListener(
              eventName,
              eventHandler as () => void
            );
          }
        } else {
          renderedElement.setAttribute(key, String(value));
        }
      }
    }

    renderChildrenIntoNode(children, renderedElement, contextStore, this);

    return renderedElement;
  },
} satisfies RenderContext;

interface DomRenderContext extends RenderContext {
  renderComponent(
    element: ComponentNode,
    contextStore: ComponentContextStore
  ): RenderedResult;
  render(element: unknown, contextStore: ComponentContextStore): RenderedResult;
  renderIntrinsic(
    element: IntrinsicNode,
    contextStore: ComponentContextStore
  ): Element;
}

function renderChildren(
  children: unknown,
  contextStore: ComponentContextStore,
  renderContext: DomRenderContext
): RenderedResult {
  if (isAtom(children)) {
    return renderAtom(children, contextStore, renderContext);
  } else if (isIterable(children) && typeof children === 'object') {
    return renderIterable(children, contextStore, renderContext);
  } else if (isNode(children)) {
    return renderNode<RenderedResult>(children, contextStore, renderContext);
  }
  return document.createTextNode(String(children));
}

function renderAtom(
  children: Atom,
  contextStore: ComponentContextStore,
  renderContext: DomRenderContext
): undefined {}

function renderIterable(
  children: Iterable<unknown>,
  contextStore: ComponentContextStore,
  renderContext: DomRenderContext
): RenderedResult {
  const renderedChildren = [];

  for (const child of children) {
    renderedChildren.push(renderChildren(child, contextStore, renderContext));
  }

  return renderedChildren;
}

function renderChildrenIntoNode(
  children: unknown,
  renderedNode: ParentNode,
  contextStore: ReadonlyUnknownRecord,
  renderContext: RenderContext
) {
  if (isAtom(children)) {
    replaceRenderAtom(children, renderedNode, contextStore, renderContext);
  } else if (isIterable(children) && typeof children === 'object') {
    replaceRenderIterable(children, renderedNode, contextStore, renderContext);
  } else {
    renderedNode.append(
      renderNode(children, contextStore, renderContext) as Node | string
    );
  }
}

function replaceRenderAtom(
  children: Atom,
  renderedNode: ParentNode,
  contextStore: ReadonlyUnknownRecord,
  renderContext: RenderContext
) {
  if (isAtomCollection(children)) {
    const keyIndexMap = new Map<unknown, number>();

    replaceRenderAtomCollection(
      children,
      keyIndexMap,
      renderedNode,
      contextStore,
      renderContext
    );

    children[emitterKey]((msg) => {
      switch (msg.type) {
        case COLLECTION_EMIT_TYPE_KEY_CHANGE:
          const { key } = msg;
          let index = keyIndexMap.get(key);

          const newChild = untracked(children).get(key);

          if (index === undefined) {
            if (newChild == null) {
              return;
            }

            index = renderedNode.children.length;
            keyIndexMap.set(key, index);

            renderedNode.append(
              renderNode(newChild, contextStore, renderContext) as Node | string
            );

            return;
          }

          const oldRenderedChild = renderedNode.children[index];

          if (oldRenderedChild) {
            if (newChild == null) {
              keyIndexMap.delete(key);
              oldRenderedChild.remove();
              return;
            }

            oldRenderedChild.replaceWith(
              renderNode(newChild, contextStore, renderContext) as Node | string
            );
          }

          return;
        case COLLECTION_EMIT_TYPE_SLICE_CHANGE:
        // TODO
        case COLLECTION_EMIT_TYPE_ALL_CHANGE:
          replaceRenderAtomCollection(
            children,
            keyIndexMap,
            renderedNode,
            contextStore,
            renderContext
          );
          return;
      }
    });
    return;
  }

  const rawChildren = untracked(children);

  if (isIterable(rawChildren) && typeof rawChildren === 'object') {
    replaceRenderIterable(
      rawChildren,
      renderedNode,
      contextStore,
      renderContext
    );

    children[emitterKey](() => {
      replaceRenderIterable(
        rawChildren,
        renderedNode,
        contextStore,
        renderContext
      );
    });
  } else {
    renderedNode.append(
      renderNode(rawChildren, contextStore, renderContext) as Node | string
    );

    children[emitterKey](() => {
      renderedNode.replaceChildren(
        renderNode(rawChildren, contextStore, renderContext) as Node | string
      );
    });
  }
}

function replaceRenderIterable(
  children: Iterable<unknown>,
  renderedParent: ParentNode,
  contextStore: ReadonlyUnknownRecord,
  renderContext: RenderContext
) {
  const renderedChildren: (Node | string)[] = [];
  for (const child of children) {
    renderedChildren.push(
      renderNode(child, contextStore, renderContext) as Node | string
    );
  }
  renderedParent.replaceChildren(...renderedChildren);
}

function replaceRenderAtomCollection(
  children: AtomCollection<
    unknown,
    unknown,
    RawAtomCollection<unknown, unknown>,
    AtomCollectionEmitChange<unknown>
  >,
  keyIndexMap: Map<unknown, number>,
  renderedParent: ParentNode,
  contextStore: ReadonlyUnknownRecord,
  renderContext: RenderContext
) {
  const renderedChildren: (Node | string)[] = [];
  let i = 0;
  for (const [key, child] of untracked(children).entries()) {
    keyIndexMap.set(key, i);
    renderedChildren.push(
      renderNode(child, contextStore, renderContext) as Node | string
    );
    i++;
  }
  renderedParent.replaceChildren(...renderedChildren);
}
