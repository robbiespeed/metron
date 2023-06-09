import {
  emitterKey,
  isAtom,
  untracked,
  type Atom,
} from '@metron/core/particle.js';
import { COLLECTION_EMIT_TYPE_KEY } from '@metron/core/collection.js';
import { type AtomList, isAtomList } from '@metron/core/list.js';

import {
  createContext,
  renderNode,
  type JsxComponentNode,
  type JsxIntrinsicNode,
  type RenderContext,
  type ComponentContextStore,
  isJsxNode,
  type JsxFragmentNode,
} from '../node.js';
import { isIterable } from '../utils.js';

interface DomRenderContext extends RenderContext {
  renderComponent(
    element: JsxComponentNode,
    contextStore: ComponentContextStore
  ): Node | Node[];
  renderFragment(
    element: JsxFragmentNode,
    contextStore: ComponentContextStore
  ): Node | Node[];
  render(element: unknown, contextStore: ComponentContextStore): Node | Node[];
  renderIntrinsic(
    element: JsxIntrinsicNode,
    contextStore: ComponentContextStore
  ): Element;
}

const EVENT_HANDLER_PREFIX = 'on:';
const EVENT_HANDLER_PREFIX_LENGTH = EVENT_HANDLER_PREFIX.length;

export const domRenderContext: DomRenderContext = {
  renderComponent(element, contextStore) {
    const { tag, props } = element as JsxComponentNode;

    const componentContext = createContext(contextStore);

    const children = tag(props, componentContext);

    const childNodes: Node[] = [];

    renderInto(childNodes, children, contextStore, this);

    return childNodes.length === 1 ? childNodes[0]! : childNodes;
  },
  renderFragment(element, contextStore) {
    const { children } = element;

    const childNodes: Node[] = [];

    renderInto(childNodes, children, contextStore, this);

    return childNodes;
  },
  render(element, contextStore) {
    const childNodes: Node[] = [];

    renderInto(childNodes, element, contextStore, this);

    return childNodes.length === 1 ? childNodes[0]! : childNodes;
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
  } else if (isJsxNode(value)) {
    const renderedComponent = renderNode(value, contextStore, renderContext);
    if (Array.isArray(renderedComponent)) {
      container.push(...renderedComponent);
    } else if (renderedComponent !== undefined) {
      container.push(renderedComponent);
    }
  } else if (value instanceof Node) {
    if (value.parentNode === null) {
      container.push(value);
    } else {
      container.push(value.cloneNode(true));
    }
  } else if (isIterable(value) && typeof value === 'object') {
    for (const child of value) {
      renderInto(container, child, contextStore, renderContext);
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
  if (isAtomList(atom)) {
    renderAtomListInto(container, atom, contextStore, renderContext);
    return;
  }

  const firstValue = untracked(atom);

  if (firstValue !== null && typeof firstValue === 'object') {
    const tmpContainer: Node[] = [];

    renderInto(tmpContainer, firstValue, contextStore, renderContext);

    const tmpContainerLength = tmpContainer.length;
    let rangeStartMarker: Node;
    if (tmpContainerLength > 0) {
      rangeStartMarker = tmpContainer[0]!;
    } else {
      rangeStartMarker = document.createComment('');
      tmpContainer.push(rangeStartMarker);
    }

    let rangeEndMarker =
      tmpContainerLength > 1
        ? tmpContainer[tmpContainerLength - 1]!
        : undefined;

    container.push(...tmpContainer);

    atom[emitterKey](() => {
      const updateContainer: Node[] = [];
      renderInto(updateContainer, untracked(atom), contextStore, renderContext);

      const updateContainerLength = updateContainer.length;
      let newRangeStartMarker: Node;
      if (updateContainerLength > 0) {
        newRangeStartMarker = updateContainer[0]!;
      } else {
        newRangeStartMarker = document.createComment('');
        updateContainer.push(newRangeStartMarker);
      }

      const newRangeEndMarker =
        updateContainerLength > 1
          ? updateContainer[updateContainerLength - 1]!
          : undefined;

      replaceRange(updateContainer, rangeStartMarker, rangeEndMarker);

      rangeStartMarker = newRangeStartMarker;
      rangeEndMarker = newRangeEndMarker;
    });
    return;
  }

  const text = document.createTextNode(
    firstValue === undefined ? '' : String(firstValue)
  );
  container.push(text);

  atom[emitterKey](() => {
    const newValue = untracked(atom);
    text.textContent = newValue === undefined ? '' : String(newValue);
  });
}

interface ListItemRenderRange {
  start: Node;
  end?: Node;
}

function renderAtomListInto(
  container: Node[],
  list: AtomList<unknown>,
  contextStore: ComponentContextStore,
  renderContext: DomRenderContext
) {
  const childNodes: Node[] = [];
  let ranges: (ListItemRenderRange | undefined)[] = [];

  for (const child of untracked(list)) {
    const startNodeIndex = childNodes.length;
    renderInto(childNodes, child, contextStore, renderContext);
    const endNodeIndex = childNodes.length - 1;
    if (startNodeIndex === endNodeIndex) {
      ranges.push({ start: childNodes[startNodeIndex]! });
    } else if (startNodeIndex < endNodeIndex) {
      ranges.push({
        start: childNodes[startNodeIndex]!,
        end: childNodes[endNodeIndex]!,
      });
    } else {
      ranges.push(undefined);
    }
  }

  container.push(...childNodes);

  let tailMarker = childNodes[childNodes.length - 1]!;
  let isTailMarkerComment = false;
  if (tailMarker === undefined) {
    tailMarker = document.createComment('');
    isTailMarkerComment = true;
    childNodes.push(tailMarker);
  }

  list[emitterKey]((msg) => {
    switch (msg.type) {
      case COLLECTION_EMIT_TYPE_KEY:
        const { key } = msg;
        const newValue = untracked(list).at(key);
        const oldRange = ranges[key];

        if (newValue === undefined) {
          if (oldRange !== undefined) {
            removeRange(oldRange.start, oldRange.end);
            ranges[key] = undefined;
          }
          return;
        }

        const updateContainer: Node[] = [];
        renderInto(updateContainer, newValue, contextStore, renderContext);
        const endNodeIndex = updateContainer.length - 1;
        if (endNodeIndex === 0) {
          ranges[key] = { start: updateContainer[0]! };
        } else if (endNodeIndex > 0) {
          ranges[key] = {
            start: updateContainer[0]!,
            end: updateContainer[endNodeIndex],
          };
        }

        if (oldRange !== undefined) {
          const shouldClear = updateContainer.length === 0;
          const isTail = oldRange.end === tailMarker;
          if (shouldClear && !isTail) {
            removeRange(oldRange.start, oldRange.end);
            ranges[key] = undefined;
            return;
          }

          if (shouldClear) {
            updateContainer.push(document.createComment(''));
          }

          replaceRange(updateContainer, oldRange.start, oldRange.end);

          if (isTail) {
            tailMarker = updateContainer[endNodeIndex]!;
            isTailMarkerComment = false;
          }

          return;
        }

        if (updateContainer.length === 0) {
          return;
        }

        const rangeToRight = findRangeToRight(key, ranges);

        if (rangeToRight !== undefined) {
          insertBefore(updateContainer, rangeToRight.start);
        } else if (isTailMarkerComment) {
          replaceRange(updateContainer, tailMarker);
        } else {
          insertAfter(updateContainer, tailMarker);
        }
        tailMarker = updateContainer[endNodeIndex]!;
        isTailMarkerComment = false;
        return;
      default:
        const oldStartRange = findRangeToRight(-1, ranges);

        const updateNodes: Node[] = [];
        ranges = [];

        for (const child of untracked(list)) {
          const startNodeIndex = updateNodes.length;
          renderInto(updateNodes, child, contextStore, renderContext);
          const endNodeIndex = updateNodes.length - 1;
          if (startNodeIndex === endNodeIndex) {
            ranges.push({ start: updateNodes[startNodeIndex]! });
          } else if (startNodeIndex < endNodeIndex) {
            ranges.push({
              start: updateNodes[startNodeIndex]!,
              end: updateNodes[endNodeIndex]!,
            });
          } else {
            ranges.push(undefined);
          }
        }

        const oldTailMarker = tailMarker;

        tailMarker = updateNodes[updateNodes.length - 1]!;
        isTailMarkerComment = false;
        if (tailMarker === undefined) {
          tailMarker = document.createComment('');
          isTailMarkerComment = true;
          updateNodes.push(tailMarker);
        }

        if (oldStartRange !== undefined) {
          replaceRange(updateNodes, oldStartRange.start, oldTailMarker);
        } else {
          replaceRange(updateNodes, oldTailMarker);
        }
        return;
    }
  });
}

function findRangeToRight(
  index: number,
  ranges: (ListItemRenderRange | undefined)[]
): ListItemRenderRange | undefined {
  for (let i = index + 1; i < ranges.length; i++) {
    const range = ranges[i];
    if (range !== undefined) {
      return range;
    }
  }
}

function insertAfter(nodes: Node[], after: Node) {
  const parent = after.parentNode;

  if (parent === null) {
    throw new Error('Expected parent for insertAfter');
  }

  const tailEndBefore = after.nextSibling;

  for (const node of nodes) {
    parent.insertBefore(node, tailEndBefore);
  }
}

function insertBefore(nodes: Node[], before: Node) {
  const parent = before.parentNode;

  if (parent === null) {
    throw new Error('Expected parent for insertBefore');
  }

  for (const node of nodes) {
    parent.insertBefore(node, before);
  }
}

function removeRange(rangeStartMarker: Node, rangeEndMarker?: Node) {
  const parent = rangeStartMarker.parentNode;

  if (parent === null) {
    throw new Error('Expected parent for range');
  }

  if (rangeEndMarker === undefined) {
    parent.removeChild(rangeStartMarker);
    return;
  }

  const range = document.createRange();
  range.setStartBefore(rangeStartMarker);
  range.setEndAfter(rangeEndMarker);
  range.deleteContents();
}

function replaceRange(
  newNodes: Node[],
  rangeStartMarker: Node,
  rangeEndMarker?: Node
) {
  const parent = rangeStartMarker.parentNode;

  if (parent === null) {
    throw new Error('Cannot replace nodes without parent');
  }

  const newNodeIterator = newNodes.values();
  let tailNode: Node = newNodeIterator.next().value;

  if (rangeEndMarker === undefined) {
    parent.replaceChild(tailNode, rangeStartMarker);
  } else {
    const range = document.createRange();
    range.setStartBefore(rangeStartMarker);
    range.setEndAfter(rangeEndMarker);
    range.deleteContents();
    range.insertNode(tailNode);
  }

  const tailEndBefore = tailNode.nextSibling;
  // TODO: check perf of using a DocumentFragment to insert nodes

  for (const node of newNodeIterator) {
    parent.insertBefore(node, tailEndBefore);
  }
}
