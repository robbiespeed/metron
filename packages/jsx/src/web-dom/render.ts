import { emitterKey, isAtom, untracked } from '@metron/core/particle.js';
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
  render,
  type ComponentNode,
  type IntrinsicNode,
  type RenderContext,
  type ReadonlyUnknownRecord,
} from '../node.js';
import { isIterable } from '../utils.js';

export const dynamicLightDom = {
  renderComponent(element, contextStore): DocumentFragment {
    const { tag, props } = element as ComponentNode;
    const componentContext = createContext(contextStore);

    const children = tag(props, componentContext);

    const renderedFragment = document.createDocumentFragment();

    renderChildrenIntoNode(children, renderedFragment, contextStore, this);

    return renderedFragment;
  },
  renderOther(element): string {
    return String(element);
  },
  renderIntrinsic(element, contextStore): Element {
    const { tag, props } = element as IntrinsicNode;
    const { children, ...restProps } = props;

    const renderedElement = document.createElement(tag);

    for (const [key, value] of Object.entries(restProps)) {
      if (isAtom(value)) {
        renderedElement.setAttribute(key, String(untracked(value)));

        value[emitterKey](() => {
          renderedElement.setAttribute(key, String(untracked(value)));
        });
      } else {
        renderedElement.setAttribute(key, String(value));
      }
    }

    renderChildrenIntoNode(children, renderedElement, contextStore, this);

    return renderedElement;
  },
} satisfies RenderContext;

function renderChildrenIntoNode(
  children: unknown,
  renderedNode: ParentNode,
  contextStore: ReadonlyUnknownRecord,
  renderContext: RenderContext
) {
  if (isAtom(children)) {
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
                render(newChild, contextStore, renderContext) as Node | string
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
                render(newChild, contextStore, renderContext) as Node | string
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
    } else if (isIterable(children)) {
      replaceRenderIterable(
        children,
        renderedNode,
        contextStore,
        renderContext
      );

      children[emitterKey](() => {
        replaceRenderIterable(
          children,
          renderedNode,
          contextStore,
          renderContext
        );
      });
    } else {
      renderedNode.append(
        render(untracked(children), contextStore, renderContext) as
          | Node
          | string
      );

      children[emitterKey](() => {
        renderedNode.replaceChildren(
          render(untracked(children), contextStore, renderContext) as
            | Node
            | string
        );
      });
    }
  } else if (isIterable(children)) {
    replaceRenderIterable(children, renderedNode, contextStore, renderContext);
  } else {
    renderedNode.append(
      render(children, contextStore, renderContext) as Node | string
    );
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
      render(child, contextStore, renderContext) as Node | string
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
      render(child, contextStore, renderContext) as Node | string
    );
    i++;
  }
  renderedParent.replaceChildren(...renderedChildren);
}
