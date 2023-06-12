import {
  emitterKey,
  isAtom,
  untracked,
  type Atom,
} from '@metron/core/particle.js';
import {
  COLLECTION_EMIT_TYPE_CLEAR,
  COLLECTION_EMIT_TYPE_KEY_ADD,
  COLLECTION_EMIT_TYPE_KEY_REMOVE,
  COLLECTION_EMIT_TYPE_KEY_SWAP,
  COLLECTION_EMIT_TYPE_KEY_WRITE,
} from '@metron/core/collection.js';
import {
  type AtomList,
  isAtomList,
  LIST_EMIT_TYPE_REVERSE,
  LIST_EMIT_TYPE_SORT,
  LIST_EMIT_TYPE_RANGE,
} from '@metron/core/list.js';

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
  // TODO: maybe the whole implementation could be simplified if ranges was a derived list
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

  list[emitterKey]((message) => {
    switch (message.type) {
      case COLLECTION_EMIT_TYPE_KEY_WRITE:
      case COLLECTION_EMIT_TYPE_KEY_ADD:
      case COLLECTION_EMIT_TYPE_KEY_REMOVE: {
        const { key } = message;
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
      }
      case COLLECTION_EMIT_TYPE_KEY_SWAP: {
        const { keySwap } = message;
        let [keyA, keyB] = keySwap;

        if (keyA > keyB) {
          // Normalize so that keyA < keyB
          [keyA, keyB] = [keyB, keyA];
        }

        const rangeA = ranges[keyA];
        const rangeB = ranges[keyB];

        swapFlow: if (rangeA !== undefined && rangeB !== undefined) {
          const rangeATail = rangeA.end ?? rangeA.start;
          const rangeBTail = rangeB.end ?? rangeB.start;
          if (rangeATail === tailMarker) {
            tailMarker = rangeBTail;
          } else if (rangeBTail === tailMarker) {
            tailMarker = rangeATail;
          }
          swapSiblingRanges(rangeA, rangeB);
        } else if (rangeA !== undefined) {
          // move rangeA after b
          const parent = rangeA.start.parentNode;

          if (parent === null) {
            throw new Error('Expected parent');
          }

          const rangeATail = rangeA.end ?? rangeA.start;

          if (rangeATail === tailMarker) {
            // Can't move further right
            break swapFlow;
          }

          const rangeToLeftOfB = findRangeToLeft(keyB, ranges);

          if (rangeToLeftOfB === rangeA) {
            // Already in correct render order
            break swapFlow;
          }

          const afterMarker = rangeToLeftOfB
            ? rangeToLeftOfB.end ?? rangeToLeftOfB.start
            : tailMarker;

          if (afterMarker === tailMarker) {
            tailMarker = rangeATail;
          }

          parent.insertBefore(
            getRangeNodeOrFragment(rangeA),
            afterMarker.nextSibling
          );
        } else if (rangeB !== undefined) {
          // move rangeB before a
          const parent = rangeB.start.parentNode;

          if (parent === null) {
            throw new Error('Expected parent');
          }

          const rangeToRightOfA = findRangeToRight(keyA, ranges);

          if (rangeToRightOfA === rangeB || rangeToRightOfA === undefined) {
            // Already in correct render order
            break swapFlow;
          }

          parent.insertBefore(
            getRangeNodeOrFragment(rangeB),
            rangeToRightOfA.start
          );
        }

        ranges[keyA] = rangeB;
        ranges[keyB] = rangeA;

        return;
      }
      case COLLECTION_EMIT_TYPE_CLEAR:
      // TODO
      case LIST_EMIT_TYPE_REVERSE:
      // TODO: fix implementation, may require ranges to contain all nodes not just start/end
      // issue with current implementation is it reverses everything inside ranges
      // {
      //   const firstRange = findRangeToRight(-1, ranges);

      //   if (firstRange === undefined) {
      //     return;
      //   }

      //   if ((firstRange.end ?? firstRange.start) === tailMarker) {
      //     return;
      //   }

      //   const nodeRange = document.createRange();
      //   nodeRange.setStartBefore(firstRange.start);
      //   nodeRange.setEndAfter(tailMarker);
      //   const nodeFragment = nodeRange.extractContents();

      //   const reversedNodes: Node[] = [];
      //   const nodeCount = nodeFragment.childNodes.length;
      //   for (let i = nodeCount - 1; i >= 0; i--) {
      //     reversedNodes.push(nodeFragment.childNodes[i]!);
      //   }
      //   nodeFragment.append(...reversedNodes);
      //   nodeRange.insertNode(nodeFragment);

      //   tailMarker = firstRange.start;
      //   ranges.reverse();
      //   return;
      // }
      case LIST_EMIT_TYPE_SORT:
      // TODO: May need ranges to contain all nodes not just start/end
      case LIST_EMIT_TYPE_RANGE:
      // TODO
      default: {
        // TODO: warn about fallback
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
    }
  });
}

function getRangeNodeOrFragment(range: ListItemRenderRange): Node {
  if (range.end) {
    const nodeRange = document.createRange();
    nodeRange.setStartBefore(range.start);
    nodeRange.setEndAfter(range.end);
    return nodeRange.extractContents();
  } else {
    return range.start;
  }
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

function findRangeToLeft(
  index: number,
  ranges: (ListItemRenderRange | undefined)[]
): ListItemRenderRange | undefined {
  for (let i = index - 1; i >= 0; i--) {
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
  // append all to the fragment then insert the fragment

  for (const node of newNodeIterator) {
    parent.insertBefore(node, tailEndBefore);
  }
}

function swapSiblingRanges(
  rangeA: ListItemRenderRange,
  rangeB: ListItemRenderRange
) {
  const parent = rangeA.start.parentNode;

  if (parent === null) {
    throw new Error('Cannot swap nodes without parent');
  }

  if (rangeA.end === undefined) {
    if (rangeB.end === undefined) {
      const temp = document.createComment('');

      parent.replaceChild(temp, rangeA.start);
      parent.replaceChild(rangeA.start, rangeB.start);
      parent.replaceChild(rangeB.start, temp);
    } else {
      const nodeRangeB = document.createRange();
      nodeRangeB.setStartBefore(rangeB.start);
      nodeRangeB.setEndAfter(rangeB.end);
      const fragmentB = nodeRangeB.extractContents();

      parent.replaceChild(fragmentB, rangeA.start);
      nodeRangeB.insertNode(rangeA.start);
    }
  } else {
    const nodeRangeA = document.createRange();
    nodeRangeA.setStartBefore(rangeA.start);
    nodeRangeA.setEndAfter(rangeA.end);
    const fragmentA = nodeRangeA.extractContents();

    if (rangeB.end === undefined) {
      parent.replaceChild(fragmentA, rangeB.start);
      nodeRangeA.insertNode(rangeB.start);
    } else {
      const nodeRangeB = document.createRange();
      nodeRangeB.setStartBefore(rangeB.start);
      nodeRangeB.setEndAfter(rangeB.end);
      const fragmentB = nodeRangeB.extractContents();

      nodeRangeA.insertNode(fragmentB);
      nodeRangeB.insertNode(fragmentA);
    }
  }
}
