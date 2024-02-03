import type { AtomArray } from '@metron/core/collections/array.js';
import {
  IS_NODE,
  IS_STATIC_COMPONENT,
  NODE_TYPE_ADVANCED,
  type JSXAdvancedNode,
  type JSXProps,
} from '../node.js';
import type { JSXContext } from '../context.js';
import type { Disposer } from '@metron/core/shared.js';
import { type TemplateComponent } from './template.js';
import { subscribe } from '@metron/core/atom.js';
import {
  ARRAY_CHANGE_STORE,
  HINT_DELETE,
  HINT_SWAP,
} from '@metron/core/collections/array/change-store.js';
import {
  eReplaceChildren,
  nAppendChild,
  nInsertBefore,
} from './dom-methods.js';

interface ForProps<TValue extends JSXProps> {
  each: AtomArray<TValue>;
  as: TemplateComponent<TValue>;
}

export function For<TValue extends JSXProps>(
  props: ForProps<TValue>
): JSXAdvancedNode<ForProps<TValue>> {
  return {
    [IS_NODE]: true,
    nodeType: NODE_TYPE_ADVANCED,
    props,
    tag: renderAtomArray,
  };
}
(For as any)[IS_STATIC_COMPONENT] = true;

// function createListDomOperators(
//   parent: ParentNode,
//   append: (node: ChildNode) => void
// ) {
//   const clearNodes = parent.replaceChildren.bind(parent);
//   const insertBefore = parent.insertBefore.bind(parent);
//   const prepend = parent.prepend.bind(parent);
//   const removeChild = parent.removeChild.bind(parent);

//   const swapNodeRanges = (a: ChildNode, b: ChildNode) => {
//     const afterB = b.nextSibling;
//     insertBefore(b, a);
//     insertBefore(a, afterB);
//   };

//   const appendRange = (s: ChildNode, e: ChildNode) => {
//     let next: ChildNode | null = s;
//     while (next !== null) {
//       const node: ChildNode = next;
//       append(node);
//       next = node === e ? null : next.nextSibling;
//     }
//   };

//   const insertRangeBeforeNode = (
//     s: ChildNode,
//     e: ChildNode,
//     beforeRef: ChildNode | null
//   ) => {
//     let next: ChildNode | null = s;
//     while (next !== null) {
//       const node: ChildNode = next;
//       insertBefore(node, beforeRef);
//       next = node === e ? null : next.nextSibling;
//     }
//   };

//   const removeUntil = (s: ChildNode, e?: ChildNode) => {
//     let next: ChildNode | null = s;
//     while (next !== null) {
//       const node: ChildNode = next;
//       removeChild(node);
//       next = node === e ? null : next.nextSibling;
//     }
//   };

//   return {
//     clearNodes,
//     prepend,
//     swapNodeRanges,
//     insertBefore,
//     appendRange,
//     insertRangeBeforeNode,
//     removeChild,
//     removeUntil,
//   };
// }

const emptyArray = [] as [];

function renderAtomArray<TValue extends {}>(
  props: ForProps<TValue>,
  context: JSXContext,
  registerDispose: (dispose: Disposer) => void,
  parent: ParentNode | null,
  _append: (el: ChildNode) => void
): undefined {
  if (parent === null) {
    throw new Error('TODO');
  }

  const clearNodes = eReplaceChildren.bind(parent);
  const insertBefore = nInsertBefore.bind(parent);
  const appendChild = nAppendChild.bind(parent);

  const array = props.each;
  const createElement = props.as;

  let values = array.unwrap().slice();
  let size = values.length;

  const indexedNodes: ChildNode[] = [];
  // TODO: this could be removed if disposer was attached to element
  let indexedDisposers: Disposer[][] = [];

  let i = 0;
  // let ii = 0;

  function appendElements() {
    // ii = i;
    indexedNodes.length = size;
    indexedDisposers.length = size;

    for (; i < size; i++) {
      const disposers: Disposer[] = [];
      indexedDisposers[i] = disposers;
      const element = createElement(values[i]!, context, (dispose) => {
        disposers.push(dispose);
      });
      indexedNodes[i] = element;
      appendChild(element);
      // append(element);
    }
    // eAppend.apply(parent, indexedNodes.slice(ii));
    // for (; ii < size; ii++) {
    //   // nAppendChild.call(parent, indexedNodes[ii]!);
    //   insertBefore(indexedNodes[ii]!, null);
    // }
  }
  appendElements();

  const changeStore = array[ARRAY_CHANGE_STORE];
  let changeToken = changeStore.nextConnectionToken;

  let range: Range | undefined;

  const disposeSubscribe = subscribe(array, () => {
    const nextValues = array.unwrap();
    const prevSize = size;
    const prevValues = values;
    size = nextValues.length;

    const change = changeStore.get(changeToken);
    changeToken = changeStore.nextConnectionToken;

    // Clear fast path
    if (size === 0) {
      disposeIndexed(indexedDisposers);
      indexedDisposers.length = 0;
      // const oldIndexedDisposers = indexedDisposers;
      // requestIdleCallback(() => disposeIndexed(oldIndexedDisposers));
      // indexedDisposers = [];
      indexedNodes.length = 0;
      clearNodes();
      values = emptyArray;

      return;
    } else {
      values = nextValues.slice();
    }

    let start: number;

    if (change !== undefined) {
      start = change.start;
      switch (change.hint) {
        case HINT_DELETE: {
          parent.removeChild(indexedNodes[start]!);
          for (const d of indexedDisposers[start]!) {
            d();
          }
          indexedNodes.splice(start, 1);
          indexedDisposers.splice(start, 1);
          return;
        }
        case HINT_SWAP: {
          const b = change.data;

          const aNode = indexedNodes[start]!;
          const bNode = indexedNodes[b]!;
          const afterB = bNode.nextSibling;
          insertBefore(bNode, aNode);
          insertBefore(aNode, afterB);

          const tmpN = indexedNodes[start]!;
          indexedNodes[start] = indexedNodes[b]!;
          indexedNodes[b] = tmpN;

          const tmpD = indexedDisposers[start]!;
          indexedDisposers[start] = indexedDisposers[b]!;
          indexedDisposers[b] = tmpD;
          return;
        }
      }
    }

    // Skip unchanged head values
    const lowEnd = size > prevSize ? prevSize : size;
    for (
      start = 0;
      start < lowEnd && prevValues[start] === values[start];
      start++
    );

    // Append fast path
    if (start === prevSize) {
      i = start;
      appendElements();
      return;
    }

    // Clear DOM from start to avoid shuffling
    if (start === 0) {
      clearNodes();
    } else if (start < prevSize) {
      range ??= document.createRange();
      range.setStartBefore(indexedNodes[start]!);
      range.setEndAfter(indexedNodes[prevSize - 1]!);
      range.deleteContents();

      // Trim fast path
      if (start === size) {
        indexedNodes.length = size;
        disposeIndexed(indexedDisposers.splice(start));
        return;
      }
    }
    // No change
    else if (start === size) {
      return;
    }

    const unstableDisposers = indexedDisposers.slice(start);
    const unstableNodes = indexedNodes.slice(start);
    const unstableSize = unstableNodes.length;
    const unstableLookup = new Map<TValue, number | undefined>();
    const unstableChain: (number | undefined)[] = new Array(unstableSize);

    indexedNodes.length = size;
    indexedDisposers.length = size;

    i = prevSize - 1;
    for (let j = unstableSize - 1; i >= start; i--, j--) {
      const value = prevValues[i]!;
      unstableChain[j] = unstableLookup.get(value);
      unstableLookup.set(value, j);
    }

    let unstableUnusedCount = unstableSize;

    for (i = start; i < size; i++) {
      const value = values[i]!;
      const unstableIndex = unstableLookup.get(value);
      if (unstableIndex === undefined) {
        const disposers: Disposer[] = [];
        indexedDisposers[i] = disposers;
        const element = createElement(values[i]!, context, (dispose) => {
          disposers.push(dispose);
        });
        indexedNodes[i] = element;
        insertBefore(element, null);

        continue;
      }

      unstableLookup.set(value, unstableChain[unstableIndex]);

      const node = unstableNodes[unstableIndex]!;
      const disposers = unstableDisposers[unstableIndex]!;
      unstableDisposers[unstableIndex] = emptyArray;
      unstableUnusedCount--;

      indexedDisposers[i] = disposers;
      indexedNodes[i] = node;
      insertBefore(node, null);
    }

    if (unstableUnusedCount > 0) {
      disposeIndexed(unstableDisposers);
      // requestIdleCallback(() => disposeIndexed(unstableDisposers));
    }
  });

  registerDispose(() => {
    disposeSubscribe();
    disposeIndexed(indexedDisposers);
  });
}

function disposeIndexed(indexedDisposers: Disposer[][]) {
  for (const disposers of indexedDisposers) {
    for (const d of disposers) {
      d();
    }
  }
}
