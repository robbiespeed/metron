import {
  emitterKey,
  isAtom,
  untracked,
  type Atom,
} from '@metron/core/particle.js';
// import {
//   COLLECTION_EMIT_TYPE_ALL_CHANGE,
//   COLLECTION_EMIT_TYPE_KEY_CHANGE,
//   COLLECTION_EMIT_TYPE_SLICE_CHANGE,
//   isAtomCollection,
//   type AtomCollection,
//   type AtomCollectionEmitChange,
//   type RawAtomCollection,
// } from '@metron/core/collection.js';

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

interface DomRenderContext extends RenderContext {
  renderComponent(
    element: ComponentNode,
    contextStore: ComponentContextStore
  ): undefined | Node | Node[];
  render(
    element: unknown,
    contextStore: ComponentContextStore
  ): undefined | Node | Node[];
  renderIntrinsic(
    element: IntrinsicNode,
    contextStore: ComponentContextStore
  ): Element;
}

const EVENT_HANDLER_PREFIX = 'on:';
const EVENT_HANDLER_PREFIX_LENGTH = EVENT_HANDLER_PREFIX.length;

export const domRenderContext: DomRenderContext = {
  renderComponent(element, contextStore) {
    const { tag, props } = element as ComponentNode;
    const componentContext = createContext(contextStore);

    const children = tag(props, componentContext);

    const childNodes: Node[] = [];

    renderInto(childNodes, children, contextStore, this);

    return childNodes.length === 1 ? childNodes[0] : childNodes;
  },
  render(element, contextStore) {
    const childNodes: Node[] = [];

    renderInto(childNodes, element, contextStore, this);

    return childNodes.length === 1 ? childNodes[0] : childNodes;
  },
  renderIntrinsic(element, contextStore): Element {
    const { tag, props } = element;
    const { children, ...restProps } = props;

    const renderedElement = document.createElement(tag);

    for (const [key, value] of Object.entries(restProps)) {
      if (isAtom(value)) {
        if (key.startsWith(EVENT_HANDLER_PREFIX)) {
          const eventName = key.slice(EVENT_HANDLER_PREFIX_LENGTH);

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
          if (value !== undefined) {
            renderedElement.setAttribute(key, String(untracked(value)));
          }

          value[emitterKey](() => {
            const newValue = untracked(value);
            if (newValue === undefined) {
              renderedElement.removeAttribute(key);
            } else {
              renderedElement.setAttribute(key, String(newValue));
            }
          });
        }
      } else if (key.startsWith(EVENT_HANDLER_PREFIX)) {
        if (typeof value === 'function') {
          const eventName = key.slice(EVENT_HANDLER_PREFIX_LENGTH);
          renderedElement.addEventListener(eventName, value as () => void);
        }
      } else if (value !== undefined) {
        renderedElement.setAttribute(key, String(value));
      }
    }

    const childNodes: Node[] = [];

    renderInto(childNodes, children, contextStore, this);

    renderedElement.append(...childNodes);

    return renderedElement;
  },
};

function renderInto(
  container: Node[],
  value: unknown,
  contextStore: ComponentContextStore,
  renderContext: DomRenderContext
) {
  if (value === undefined) {
    return;
  }

  if (isAtom(value)) {
    renderAtomInto(container, value, contextStore, renderContext);
  } else if (isIterable(value) && typeof value === 'object') {
    for (const child of value) {
      renderInto(container, child, contextStore, renderContext);
    }
  } else if (isNode(value)) {
    const renderedComponent = renderNode<undefined | Node | Node[]>(
      value,
      contextStore,
      renderContext
    );
    if (Array.isArray(renderedComponent)) {
      container.push(...renderedComponent);
    } else if (renderedComponent !== undefined) {
      container.push(renderedComponent);
    }
  } else {
    container.push(document.createTextNode(String(value)));
  }
}

function renderAtomInto(
  container: Node[],
  atom: Atom,
  contextStore: ComponentContextStore,
  renderContext: DomRenderContext
) {
  // TODO: Handle atom collection

  const firstValue = untracked(atom);

  if (typeof firstValue === 'object' && isIterable(firstValue)) {
    const rangeStartMarker = document.createComment('');
    container.push(rangeStartMarker);

    for (const child of firstValue) {
      renderInto(container, child, contextStore, renderContext);
    }

    const rangeEndMarker = document.createComment('');
    container.push(rangeEndMarker);

    atom[emitterKey](() => {
      const updateContainer: Node[] = [];
      renderInto(updateContainer, untracked(atom), contextStore, renderContext);

      replaceRange(rangeStartMarker, rangeEndMarker, updateContainer);
    });
    return;
  } else if (isNode(firstValue)) {
    // Todo
    return;
  }

  const text = document.createTextNode(
    firstValue === undefined ? '' : String(firstValue)
  );
  container.push(text);

  atom[emitterKey](() => {
    const newValue = untracked(atom);
    text.textContent = newValue === undefined ? '' : String(newValue);

    // if (newValue === undefined) {
    // } else if (typeof newValue === 'object' && isIterable(newValue)) {
    //   // Todo: convert to iterable
    //   // terminator();
    //   // const updateContainer: Node[] = [];
    //   // renderAtomInto(updateContainer, atom, contextStore, renderContext);
    //   throw Error('Converting to iterable not implemented');
    // } else if (isNode(newValue)) {
    //   throw Error('Converting to node not implemented');
    // } else {
    //   text.textContent = String(newValue);
    // }
  });
}

function replaceRange(
  rangeStartMarker: Node,
  rangeEndMarker: Node,
  newNodes: Node[]
) {
  const parent = rangeStartMarker.parentNode;

  if (parent === null) {
    throw new Error('Cannot replace nodes without parent');
  }

  const range = document.createRange();
  range.setStartAfter(rangeStartMarker);
  range.setEndBefore(rangeEndMarker);

  range.deleteContents();

  // TODO: check perf of using a DocumentFragment to insert nodes
  for (const node of newNodes) {
    parent.insertBefore(node, rangeEndMarker);
  }
}

// function replaceRenderAtom(
//   children: Atom,
//   renderedNode: ParentNode,
//   contextStore: ComponentContextStore,
//   renderContext: RenderContext
// ) {
//   if (isAtomCollection(children)) {
//     const keyIndexMap = new Map<unknown, number>();

//     replaceRenderAtomCollection(
//       children,
//       keyIndexMap,
//       renderedNode,
//       contextStore,
//       renderContext
//     );

//     children[emitterKey]((msg) => {
//       switch (msg.type) {
//         case COLLECTION_EMIT_TYPE_KEY_CHANGE:
//           const { key } = msg;
//           let index = keyIndexMap.get(key);

//           const newChild = untracked(children).get(key);

//           if (index === undefined) {
//             if (newChild == null) {
//               return;
//             }

//             index = renderedNode.children.length;
//             keyIndexMap.set(key, index);

//             renderedNode.append(
//               renderNode(newChild, contextStore, renderContext) as Node | string
//             );

//             return;
//           }

//           const oldRenderedChild = renderedNode.children[index];

//           if (oldRenderedChild) {
//             if (newChild == null) {
//               keyIndexMap.delete(key);
//               oldRenderedChild.remove();
//               return;
//             }

//             oldRenderedChild.replaceWith(
//               renderNode(newChild, contextStore, renderContext) as Node | string
//             );
//           }

//           return;
//         case COLLECTION_EMIT_TYPE_SLICE_CHANGE:
//         // TODO
//         case COLLECTION_EMIT_TYPE_ALL_CHANGE:
//           replaceRenderAtomCollection(
//             children,
//             keyIndexMap,
//             renderedNode,
//             contextStore,
//             renderContext
//           );
//           return;
//       }
//     });
//     return;
//   }

//   const rawChildren = untracked(children);

//   if (isIterable(rawChildren) && typeof rawChildren === 'object') {
//     replaceRenderIterable(
//       rawChildren,
//       renderedNode,
//       contextStore,
//       renderContext
//     );

//     children[emitterKey](() => {
//       replaceRenderIterable(
//         untracked(children),
//         renderedNode,
//         contextStore,
//         renderContext
//       );
//     });
//   } else {
//     renderedNode.append(
//       renderNode(rawChildren, contextStore, renderContext) as Node | string
//     );

//     children[emitterKey](() => {
//       renderedNode.replaceChildren(
//         renderNode(rawChildren, contextStore, renderContext) as Node | string
//       );
//     });
//   }
// }
