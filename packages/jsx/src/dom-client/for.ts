import type { AtomArray } from '@metron/core/collections/array.js';
import {
  IS_NODE,
  IS_STATIC_COMPONENT,
  NODE_TYPE_ADVANCED,
  type JSXAdvancedNode,
  type JSXProps,
  type Register,
} from '../node.js';
import type { JSXContext } from '../context.js';
import type { Disposer } from '@metron/core/shared.js';
import { type TemplateComponent } from './template.js';
import { subscribe } from '@metron/core/atom.js';
import {
  ARRAY_CHANGE_STORE,
  HINT_DELETE,
  HINT_INSERT,
  HINT_SET,
  HINT_SWAP,
} from '@metron/core/collections/array/change-store.js';

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

const emptyArray = [] as [];

function renderAtomArray<TValue extends {}>(
  props: ForProps<TValue>,
  context: JSXContext,
  register: Register,
  append: (child: ChildNode) => void,
  parent: ParentNode | undefined
): undefined {
  const array = props.each;
  const createElement = props.as;

  let values = array.unwrap().slice();
  let size = values.length;

  const indexedNodes: ChildNode[] = new Array(size);
  const indexedDisposers: Disposer[][] = new Array(size);

  let tail: ChildNode | null;
  let range: Range | undefined;
  let clearNodes: () => undefined;

  // TODO: not necessary if we make it loop through an remove
  // Could be better to remove remaining unstable items after slow path?
  if (parent === undefined) {
    tail = document.createComment('');
    append(tail);
    parent = tail.parentNode!;

    clearNodes = () => {
      range ??= document.createRange();
      range.setStartBefore(indexedNodes[0]!);
      range.setEndBefore(tail!);
      range.deleteContents();
    };
  } else {
    tail = null;
    clearNodes = () => {
      parent!.textContent = '';
    };
  }

  let i = 0;

  function appendElements() {
    indexedNodes.length = size;
    indexedDisposers.length = size;

    for (; i < size; i++) {
      const disposers: Disposer[] = [];
      indexedDisposers[i] = disposers;
      const element = createElement(values[i]!, context, (dispose) => {
        disposers.push(dispose);
      });
      indexedNodes[i] = element;
      parent!.insertBefore(element, tail);
    }
  }
  appendElements();

  const changeStore = array[ARRAY_CHANGE_STORE];
  let changeToken = changeStore.nextConnectionToken;
  let refreshToken = changeStore.refreshToken;

  const disposeSubscribe = subscribe(array, () => {
    const nextValues = array.unwrap();
    const prevSize = size;
    const prevValues = values;
    size = nextValues.length;

    const change = changeStore.get(changeToken);
    changeToken = changeStore.nextConnectionToken;

    // Clear fast path
    if (size === 0) {
      if (prevSize === 0) {
        return;
      }
      disposeIndexed(indexedDisposers);
      clearNodes();
      indexedDisposers.length = 0;
      indexedNodes.length = 0;
      values = emptyArray;

      return;
    } else {
      values = nextValues.slice();
    }

    if (refreshToken !== changeStore.refreshToken) {
      refreshToken = changeStore.refreshToken;
      if (prevSize > 0) {
        disposeIndexed(indexedDisposers);
        clearNodes();
      }
      i = 0;
      appendElements();

      return;
    }

    let start: number;

    if (change !== undefined) {
      start = change.start;
      switch (change.hint) {
        case HINT_DELETE: {
          parent!.removeChild(indexedNodes[start]!);
          for (const d of indexedDisposers[start]!) {
            d();
          }
          indexedNodes.splice(start, 1);
          indexedDisposers.splice(start, 1);
          return;
        }
        case HINT_INSERT: {
          const disposers: Disposer[] = [];
          const element = createElement(values[start]!, context, (dispose) => {
            disposers.push(dispose);
          });
          const next = indexedNodes[start]!;
          indexedNodes.splice(start, 0, element);
          indexedDisposers.splice(start, 0, disposers);

          parent!.insertBefore(element, next);
          return;
        }
        case HINT_SET: {
          const disposers: Disposer[] = [];
          const element = createElement(values[start]!, context, (dispose) => {
            disposers.push(dispose);
          });
          parent!.replaceChild(element, indexedNodes[start]!);
          for (const d of indexedDisposers[start]!) {
            d();
          }
          indexedNodes[start] = element;
          indexedDisposers[start] = disposers;

          return;
        }
        case HINT_SWAP: {
          const b = change.data;

          const aNode = indexedNodes[start]!;
          const bNode = indexedNodes[b]!;
          const afterB = bNode.nextSibling;
          parent!.insertBefore(bNode, aNode);
          parent!.insertBefore(aNode, afterB);

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
        const node = createElement(values[i]!, context, (dispose) => {
          disposers.push(dispose);
        });
        indexedNodes[i] = node;
        parent!.insertBefore(node, tail);

        continue;
      }

      unstableLookup.set(value, unstableChain[unstableIndex]);

      const node = unstableNodes[unstableIndex]!;
      const disposers = unstableDisposers[unstableIndex]!;
      unstableDisposers[unstableIndex] = emptyArray;
      unstableUnusedCount--;

      indexedDisposers[i] = disposers;
      indexedNodes[i] = node;
      parent!.insertBefore(node, tail);
    }

    if (unstableUnusedCount > 0) {
      disposeIndexed(unstableDisposers);
    }
  });

  register(() => {
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
