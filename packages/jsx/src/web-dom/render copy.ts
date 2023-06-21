import {
  emitterKey,
  isAtom,
  untracked,
  type Atom,
} from '@metron/core/particle';
import {
  COLLECTION_EMIT_TYPE_CLEAR,
  COLLECTION_EMIT_TYPE_KEY_ADD,
  COLLECTION_EMIT_TYPE_KEY_DELETE,
  COLLECTION_EMIT_TYPE_KEY_SWAP,
  COLLECTION_EMIT_TYPE_KEY_WRITE,
} from '@metron/core/collection';
import {
  type AtomList,
  isAtomList,
  LIST_EMIT_TYPE_REVERSE,
  LIST_EMIT_TYPE_SORT,
  LIST_EMIT_TYPE_APPEND,
} from '@metron/core/list';

import {
  createContext,
  renderNode,
  type JsxComponentNode,
  type JsxIntrinsicNode,
  type RenderContext,
  type ComponentContextStore,
  isJsxNode,
  type JsxProps,
} from '../node.js';
import { isIterable } from '../utils.js';

interface DomRenderContextProps extends JsxProps {
  readonly root: Element;
  readonly children: unknown;
}

type Disposer = () => void;

interface DomSingleRenderResult<TNode extends ChildNode = ChildNode> {
  type: typeof RENDER_RESULT_TYPE_SINGLE;
  dispose?: Disposer;
  node: TNode;
}

interface DomManyRenderResult {
  type: typeof RENDER_RESULT_TYPE_MANY;
  disposers: Disposer[];
  nodes: ChildNode[];
}

interface DomRenderContext
  extends RenderContext<
    DomRenderContextProps,
    DomSingleRenderResult | DomManyRenderResult
  > {
  renderRoot(
    props: DomRenderContextProps,
    contextStore: ComponentContextStore
  ): DomSingleRenderResult<Element>;
  renderIntrinsic(
    element: JsxIntrinsicNode,
    contextStore: ComponentContextStore
  ): DomSingleRenderResult<Element>;
}

const RENDER_RESULT_TYPE_SINGLE = 0;
const RENDER_RESULT_TYPE_MANY = 1;

const EVENT_HANDLER_PREFIX = 'on:';
const EVENT_HANDLER_PREFIX_LENGTH = EVENT_HANDLER_PREFIX.length;

export const domRenderContext: DomRenderContext = {
  renderRoot({ root, children }, contextStore) {
    const result = this?.renderUnknown(children, contextStore, false);
    if (result.type === RENDER_RESULT_TYPE_MANY) {
      root.replaceChildren(...result.nodes);

      return {
        type: RENDER_RESULT_TYPE_SINGLE,
        dispose: () => {
          root.innerHTML = '';
          const { disposers } = result;
          if (disposers) {
            for (const d of disposers) {
              d();
            }
          }
        },
        node: root,
      };
    }
    root.replaceChildren(result.node);
    return {
      type: RENDER_RESULT_TYPE_SINGLE,
      dispose: () => {
        root.innerHTML = '';
        result.dispose?.();
      },
      node: root,
    };
  },
  renderComponent(element, contextStore) {
    const { tag, props } = element as JsxComponentNode;

    const componentContext = createContext(contextStore);

    const children = tag(props, componentContext);

    const childNodes: ChildNode[] = [];

    renderInto(childNodes, children, contextStore, this);

    return {
      type: RENDER_RESULT_TYPE_MANY,
      nodes: childNodes,
      disposers: [],
    };
  },
  renderFragment(element, contextStore) {
    const { children } = element;

    const childNodes: ChildNode[] = [];

    renderInto(childNodes, children, contextStore, this);

    return {
      type: RENDER_RESULT_TYPE_MANY,
      nodes: childNodes,
      disposers: [],
    };
  },
  renderUnknown(element, contextStore) {
    const childNodes: ChildNode[] = [];

    renderInto(childNodes, element, contextStore, this);

    return {
      type: RENDER_RESULT_TYPE_MANY,
      nodes: childNodes,
      disposers: [],
    };
  },
  renderIntrinsic(element, contextStore) {
    const { tag, props } = element;
    const { children, ...restProps } = props as Record<string, unknown>;

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

    const childNodes: ChildNode[] = [];

    // TODO: add bool param isImidiateChild
    renderInto(childNodes, children, contextStore, this);

    renderedElement.append(...childNodes);

    return {
      type: RENDER_RESULT_TYPE_SINGLE,
      dispose: () => {},
      node: renderedElement,
    };
  },
};

function renderInto(
  container: ChildNode[],
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
    const result = renderNode(value, contextStore, renderContext);
    if (result === undefined) {
      return;
    }
    if (result.type === RENDER_RESULT_TYPE_MANY) {
      container.push(...result.nodes);
    } else {
      container.push(result.node);
    }
  } else if (value instanceof Element || value instanceof CharacterData) {
    if (value.parentNode === null) {
      container.push(value as ChildNode);
    } else {
      container.push(value.cloneNode(true) as ChildNode);
    }
  } else if (isIterable(value) && typeof value === 'object') {
    for (const child of value) {
      renderInto(container, child, contextStore, renderContext);
    }
  } else {
    container.push(document.createTextNode(String(value)));
  }
}

type NonEmptyChildNodes = [ChildNode, ...ChildNode[]];

function renderAtomInto(
  container: ChildNode[],
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
    const tmpContainer: ChildNode[] = [];

    renderInto(tmpContainer, firstValue, contextStore, renderContext);

    const tmpContainerLength = tmpContainer.length;
    let rangeStartMarker: ChildNode;
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
      const updateContainer: ChildNode[] = [];
      renderInto(updateContainer, untracked(atom), contextStore, renderContext);

      const updateContainerLength = updateContainer.length;
      let newRangeStartMarker: ChildNode;
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

      replaceRange(
        updateContainer as NonEmptyChildNodes,
        rangeStartMarker,
        rangeEndMarker
      );

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

type IndexedNodes = (undefined | NonEmptyChildNodes)[];

function renderAtomListInto(
  container: ChildNode[],
  list: AtomList<unknown>,
  contextStore: ComponentContextStore,
  renderContext: DomRenderContext
) {
  // TODO: maybe the whole implementation could be simplified if ranges was a derived list
  const indexedNodes: IndexedNodes = [];

  let i = 0;
  for (const child of untracked(list)) {
    const nodes: ChildNode[] = [];
    renderInto(nodes, child, contextStore, renderContext);
    if (nodes.length > 0) {
      container.push(...nodes);
      indexedNodes[i] = nodes as NonEmptyChildNodes;
    }
    i++;
  }

  let tailMarker: ChildNode;
  let tailMarkerIndex = -1;
  if (indexedNodes.length === 0) {
    tailMarker = document.createComment('');
    container.push(tailMarker);
  } else {
    tailMarkerIndex = indexedNodes.length - 1;
    tailMarker = indexedNodes[tailMarkerIndex]!.at(-1)!;
  }

  list[emitterKey]((message) => {
    switch (message.type) {
      case COLLECTION_EMIT_TYPE_KEY_DELETE: {
        const { key } = message;

        const parent = tailMarker.parentElement!;
        let nodeAfter: ChildNode | null = null;
        let isTail = false;
        const oldNodes = indexedNodes[key];

        if (key < tailMarkerIndex) {
          indexedNodes.splice(key, 1);
        }

        if (oldNodes !== undefined) {
          const oldTail = oldNodes.at(-1)!;
          isTail = oldTail === tailMarker;
          nodeAfter = oldTail.nextSibling;
          removeNodes(oldNodes);
        }

        if (isTail) {
          // If it was the tail we look to the left since nothing in the list should be on the right
          const leftIndex = findIndexOfNodesToLeft(indexedNodes, key);

          if (leftIndex >= 0) {
            tailMarker = indexedNodes[leftIndex]!.at(-1)!;
            tailMarkerIndex = leftIndex;
          } else {
            // If no nodes to left then we need to make a comment marker
            tailMarker = document.createComment('');
            tailMarkerIndex = -1;
            if (nodeAfter === null) {
              parent.appendChild(tailMarker);
            } else {
              nodeAfter.before(tailMarker);
            }
          }
        }

        return;
      }
      case COLLECTION_EMIT_TYPE_KEY_WRITE:
      case COLLECTION_EMIT_TYPE_KEY_ADD: {
        const { key } = message;
        const isInOrder =
          message.type === COLLECTION_EMIT_TYPE_KEY_WRITE ||
          key >= tailMarkerIndex;

        const parent = tailMarker.parentElement!;
        let nodeAfter: ChildNode | null = null;
        let isTail = false;

        if (!isInOrder) {
          indexedNodes.splice(key, 0, undefined);
        }
        const newValue = untracked(list).at(key);
        const oldNodes = indexedNodes[key];

        if (oldNodes !== undefined) {
          const oldTail = oldNodes.at(-1)!;
          isTail = oldTail === tailMarker;
          nodeAfter = oldTail.nextSibling;
          removeNodes(oldNodes);
        }

        let newNodes: ChildNode[] | undefined;
        if (newValue !== undefined) {
          newNodes = [];
          renderInto(newNodes, newValue, contextStore, renderContext);
        }

        if (newNodes === undefined || newNodes.length === 0) {
          indexedNodes[key] = undefined;
          if (isTail) {
            // If it was the tail we look to the left since nothing in the list should be on the right
            const leftIndex = findIndexOfNodesToLeft(indexedNodes, key);

            if (leftIndex >= 0) {
              tailMarker = indexedNodes[leftIndex]!.at(-1)!;
              tailMarkerIndex = leftIndex;
            } else {
              // If no nodes to left then we need to make a comment marker
              tailMarker = document.createComment('');
              tailMarkerIndex = -1;
              if (nodeAfter === null) {
                parent.appendChild(tailMarker);
              } else {
                nodeAfter.before(tailMarker);
              }
            }
          }
        } else {
          assertOverride<NonEmptyChildNodes>(newNodes);
          indexedNodes[key] = newNodes;
          if (isTail || key >= tailMarkerIndex) {
            if (tailMarkerIndex === -1) {
              tailMarker.remove();
            }
            tailMarker = newNodes.at(-1)!;
            tailMarkerIndex = key;
          }
          if (nodeAfter === null) {
            parent.append(...newNodes);
          } else {
            nodeAfter.before(...newNodes);
          }
        }
        return;
      }
      case COLLECTION_EMIT_TYPE_KEY_SWAP: {
        const { keySwap } = message;
        let [keyA, keyB] = keySwap;

        if (keyA > keyB) {
          // Normalize so that keyA < keyB
          [keyA, keyB] = [keyB, keyA];
        }

        const aNodes = indexedNodes[keyA];
        const bNodes = indexedNodes[keyB];

        if (aNodes === bNodes) {
          // If A and B are the same they must both be undefined
          return;
        }

        indexedNodes[keyA] = bNodes;
        indexedNodes[keyB] = aNodes;

        if (bNodes !== undefined) {
          const isBTail = bNodes.at(-1) === tailMarker;

          if (aNodes !== undefined) {
            swapNodeLists(aNodes, bNodes);

            if (isBTail) {
              tailMarker = aNodes.at(-1)!;
            }
          } else {
            if (isBTail) {
              // We know atleast B is now left of old B
              const leftOfOldBIndex = findIndexOfNodesToLeft(
                indexedNodes,
                keyB
              );

              indexedNodes.length = leftOfOldBIndex + 1;

              if (leftOfOldBIndex === keyA) {
                // No-op if new tail is old tail
                return;
              }

              tailMarker = indexedNodes[leftOfOldBIndex]!.at(-1)!;
            }
            // New B is not tail so there must be something else to the right
            const rightOfNewB =
              indexedNodes[findIndexOfNodesToRight(indexedNodes, keyA)]!;
            rightOfNewB.at(-1)!.before(...bNodes);
          }
        } else {
          // B is empty, A is not
          assertOverride<NonEmptyChildNodes>(aNodes);

          const aTail = aNodes.at(-1)!;
          if (aTail === tailMarker) {
            return;
          }

          const leftOfOldBIndex = findIndexOfNodesToLeft(indexedNodes, keyB);

          if (leftOfOldBIndex === keyA) {
            return;
          }

          const leftOfOldB = indexedNodes[leftOfOldBIndex]!;

          if (leftOfOldB.at(-1) === tailMarker) {
            tailMarker = aTail;
          }

          leftOfOldB[0].before(...aNodes);
        }
        return;
      }
      case COLLECTION_EMIT_TYPE_CLEAR: {
        if (tailMarkerIndex === -1) {
          return;
        }

        const nodesToRemove = [];
        for (const nodes of indexedNodes) {
          if (nodes !== undefined) {
            nodesToRemove.push(...nodes);
          }
        }
        indexedNodes.length = 0;

        const parent = tailMarker.parentElement!;
        const afterNode = tailMarker.nextSibling;

        removeNodes(nodesToRemove);
        tailMarker = document.createComment('');
        tailMarkerIndex = -1;
        if (afterNode === null) {
          parent.append(tailMarker);
        } else {
          afterNode.before(tailMarker);
        }
        return;
      }
      case LIST_EMIT_TYPE_APPEND: {
        const { oldSize } = message;

        const values = untracked(list).toArraySlice(oldSize);

        const parent = tailMarker.parentElement!;
        const afterNode = tailMarker.nextSibling;

        const updateContainer: ChildNode[] = [];

        let i = oldSize;
        for (const child of values) {
          const nodes: ChildNode[] = [];
          renderInto(nodes, child, contextStore, renderContext);
          if (nodes.length > 0) {
            updateContainer.push(...nodes);
            indexedNodes[i] = nodes as NonEmptyChildNodes;
          }
          i++;
        }

        if (indexedNodes.length === 0) {
          return;
        } else {
          if (tailMarkerIndex === -1) {
            tailMarker.remove();
          }
          tailMarkerIndex = indexedNodes.length - 1;
          tailMarker = indexedNodes[tailMarkerIndex]!.at(-1)!;
        }

        if (afterNode === null) {
          parent.append(...updateContainer);
        } else {
          afterNode.before(...updateContainer);
        }

        return;
      }
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

      //   const reversedNodes: ChildNode[] = [];
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
      // case LIST_EMIT_TYPE_RANGE:
      // TODO
      default: {
        // TODO: warn about fallback
        const nodesToRemove = [];
        for (const nodes of indexedNodes) {
          if (nodes !== undefined) {
            nodesToRemove.push(...nodes);
          }
        }
        indexedNodes.length = 0;

        const parent = tailMarker.parentElement!;
        const afterNode = tailMarker.nextSibling;

        removeNodes(nodesToRemove);

        const updateContainer: ChildNode[] = [];

        let i = 0;
        for (const child of untracked(list)) {
          const nodes: ChildNode[] = [];
          renderInto(nodes, child, contextStore, renderContext);
          if (nodes.length > 0) {
            updateContainer.push(...nodes);
            indexedNodes[i] = nodes as NonEmptyChildNodes;
          }
          i++;
        }

        if (indexedNodes.length === 0) {
          if (tailMarkerIndex === -1) {
            return;
          }
          tailMarker = document.createComment('');
          tailMarkerIndex = -1;
          updateContainer.push(tailMarker);
        } else {
          if (tailMarkerIndex === -1) {
            tailMarker.remove();
          }
          tailMarkerIndex = indexedNodes.length - 1;
          tailMarker = indexedNodes[tailMarkerIndex]!.at(-1)!;
        }

        if (afterNode === null) {
          parent.append(...updateContainer);
        } else {
          afterNode.before(...updateContainer);
        }
        return;
      }
    }
  });
}

// TODO: move to shared package
function assertOverride<T>(value: unknown): asserts value is T {}

function findIndexOfNodesToRight(
  indexedNodes: IndexedNodes,
  index: number
): number {
  for (let i = index + 1; i < indexedNodes.length; i++) {
    const nodes = indexedNodes[i];
    if (nodes !== undefined) {
      return i;
    }
  }
  return -1;
}

function findIndexOfNodesToLeft(
  indexedNodes: IndexedNodes,
  index: number
): number {
  for (let i = index - 1; i >= 0; i--) {
    const nodes = indexedNodes[i];
    if (nodes !== undefined) {
      return i;
    }
  }
  return -1;
}

function removeNodes(nodes: ChildNode[]) {
  const fragment = document.createDocumentFragment();
  fragment.append(...nodes);
}

function swapNodeLists(aNodes: NonEmptyChildNodes, bNodes: NonEmptyChildNodes) {
  const firstA = aNodes[0];
  const lastB = bNodes.at(-1)!;
  const afterB = lastB.nextSibling;
  const beforeA = firstA.previousSibling;
  const parentNode = firstA.parentNode!;

  if (afterB === null) {
    parentNode.append(...aNodes);
  } else {
    afterB.before(...aNodes);
  }
  if (beforeA === null) {
    parentNode.prepend(...bNodes);
  } else {
    beforeA.after(...bNodes);
  }

  // const firstA = aNodes[0];
  // const firstB = bNodes[0];
  // const afterB = firstB.nextSibling;
  // const parentNode = firstA.parentNode!;

  // parentNode.insertBefore(firstB, firstA);
  // parentNode.insertBefore(firstA, afterB);

  // const temp = document.createComment('');
  // aNodes[0].replaceWith(temp);
  // bNodes[0].replaceWith(...aNodes);
  // temp.replaceWith(...bNodes);
}

// function replaceChildren(parent: ParentNode, newNodes: ChildNode[]) {
//   parent.textContent = '';
//   parent.append(...newNodes);
// }

function replaceRange(
  newNodes: [ChildNode, ...ChildNode[]],
  rangeStartMarker: ChildNode,
  rangeEndMarker?: ChildNode
) {
  const parent = rangeStartMarker.parentNode;

  if (parent === null) {
    throw new Error('Cannot replace nodes without parent');
  }

  if (rangeEndMarker === undefined) {
    rangeStartMarker.replaceWith(...newNodes);
    return;
  }

  const tailEndBefore = rangeEndMarker.nextSibling;
  const range = document.createRange();
  range.setStartBefore(rangeStartMarker);
  range.setEndAfter(rangeEndMarker);
  range.deleteContents();
  if (tailEndBefore === null) {
    parent.append(...newNodes);
  } else {
    tailEndBefore.before(...newNodes);
  }

  // TODO: check perf of using a DocumentFragment to insert nodes
  // append all to the fragment then insert the fragment
  // const { length } = newNodes;

  // while (i < length) {
  //   parent.insertBefore(newNodes[i]!, tailEndBefore);
  //   i++;
  // }
}
