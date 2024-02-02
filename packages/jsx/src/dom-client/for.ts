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
import { TEMPLATE_RENDER, type TemplateComponent } from './template.js';
import { subscribe } from '@metron/core/atom.js';
import {
  ARRAY_CHANGE_STORE,
  HINT_DELETE,
  HINT_SWAP,
} from '@metron/core/collections/array/change-store.js';

interface ForMapProps<TValue extends {}, TProps extends JSXProps> {
  each: AtomArray<TValue>;
  map: (value: TValue) => TProps;
  template: TemplateComponent<TProps>;
}

export function For<TValue extends {}, TProps extends JSXProps>(
  props: ForMapProps<TValue, TProps>
): JSXAdvancedNode<ForMapProps<TValue, TProps>> {
  return {
    [IS_NODE]: true,
    nodeType: NODE_TYPE_ADVANCED,
    props,
    tag: renderAtomArray,
  };
}
(For as any)[IS_STATIC_COMPONENT] = true;

// TODO: Don't need bounds because items are guaranteed to be single dom element
function createListDomOperators(
  parent: ParentNode,
  append: (node: ChildNode) => void
) {
  const clearNodes = parent.replaceChildren.bind(parent);
  const insertBefore = parent.insertBefore.bind(parent);
  const prepend = parent.prepend.bind(parent);
  const removeChild = parent.removeChild.bind(parent);

  const swapNodeRanges = (a: ChildNode, b: ChildNode) => {
    const afterB = b.nextSibling;
    insertBefore(b, a);
    insertBefore(a, afterB);
  };

  const appendRange = (s: ChildNode, e: ChildNode) => {
    let next: ChildNode | null = s;
    while (next !== null) {
      const node: ChildNode = next;
      append(node);
      next = node === e ? null : next.nextSibling;
    }
  };

  const insertRangeBeforeNode = (
    s: ChildNode,
    e: ChildNode,
    beforeRef: ChildNode | null
  ) => {
    let next: ChildNode | null = s;
    while (next !== null) {
      const node: ChildNode = next;
      insertBefore(node, beforeRef);
      next = node === e ? null : next.nextSibling;
    }
  };

  const removeUntil = (s: ChildNode, e?: ChildNode) => {
    let next: ChildNode | null = s;
    while (next !== null) {
      const node: ChildNode = next;
      removeChild(node);
      next = node === e ? null : next.nextSibling;
    }
  };

  return {
    clearNodes,
    prepend,
    swapNodeRanges,
    insertBefore,
    appendRange,
    insertRangeBeforeNode,
    removeChild,
    removeUntil,
  };
}

const emptyArray = [] as [];

function renderAtomArray<TValue extends {}, TProps extends JSXProps>(
  props: ForMapProps<TValue, TProps>,
  context: JSXContext,
  registerDispose: (dispose: Disposer) => void,
  parent: ParentNode | null,
  append: (el: ChildNode) => void
): undefined {
  if (parent === null) {
    throw new Error('TODO');
  }

  const {
    clearNodes,
    // swapNodeRanges,
    insertBefore,
    // appendRange,
    // insertRangeBeforeNode,
    // removeUntil,
  } = createListDomOperators(parent, append);

  const array = props.each;
  const map = props.map;
  const renderTemplate = props.template[TEMPLATE_RENDER];

  let values = array.unwrap().slice();
  let size = values.length;

  const indexedNodes: ChildNode[] = new Array(size);
  // TODO: this could be removed if disposer was attached to element
  let indexedDisposers: Disposer[][] = new Array(size);

  let i = 0;

  function indexedAppend(node: ChildNode) {
    indexedNodes[i] = node;
    append(node);
  }

  function indexedRegDispose(dispose: Disposer) {
    indexedDisposers[i]!.push(dispose);
  }

  for (; i < size; i++) {
    indexedDisposers[i] = [];
    renderTemplate(
      map(values[i]!),
      context,
      indexedRegDispose,
      null,
      indexedAppend
    );
  }

  const changeStore = array[ARRAY_CHANGE_STORE];
  let changeToken = changeStore.nextConnectionToken;

  let range: Range | undefined;

  const disposeSubscribe = subscribe(array, () => {
    const nextValues = array.unwrap();
    // const change = undefined;
    const change = changeStore.get(changeToken);
    changeToken = changeStore.nextConnectionToken;
    const nextSize = nextValues.length;

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

          // TODO: could remove repeating this by moving it to the top and using new const prev*
          size = nextSize;
          values = nextValues.slice();
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

          values = nextValues.slice();
          return;
        }
      }
    }

    // Init fast path
    if (size === 0) {
      for (i = 0; i < nextSize; i++) {
        indexedDisposers[i] = [];
        renderTemplate(
          map(nextValues[i]!),
          context,
          indexedRegDispose,
          null,
          indexedAppend
        );
      }
      size = nextSize;
      values = nextValues.slice();

      return;
    }

    // Clear fast path
    if (nextSize === 0) {
      disposeIndexed(indexedDisposers);
      indexedDisposers.length = 0;
      // const oldIndexedDisposers = indexedDisposers;
      // requestIdleCallback(() => disposeIndexed(oldIndexedDisposers));
      // indexedDisposers = [];
      indexedNodes.length = 0;
      clearNodes();
      size = 0;
      values = emptyArray;
    }

    const lowEnd = nextSize > size ? size : nextSize;

    // Skip unchanged front values
    for (
      start = 0;
      start < lowEnd && values[start] === nextValues[start];
      start++
    );

    // Append fast path
    if (start === size) {
      for (i = start; i < nextSize; i++) {
        indexedDisposers[i] = [];
        renderTemplate(
          map(nextValues[i]!),
          context,
          indexedRegDispose,
          null,
          indexedAppend
        );
      }
      size = nextSize;
      values = nextValues.slice();

      return;
    }

    const unstableDisposers = indexedDisposers.slice(start);
    const unstableNodes = indexedNodes.slice(start);
    const unstableSize = unstableNodes.length;
    const unstableLookup = new Map<TValue, number | undefined>();
    const unstableChain: (number | undefined)[] = new Array(unstableSize);

    if (start === 0) {
      clearNodes();
    } else {
      range ??= document.createRange();
      range.setStartBefore(indexedNodes[start]!);
      range.setEndAfter(indexedNodes[size - 1]!);
      range.deleteContents();
    }

    i = size - 1;
    for (let j = unstableSize - 1; i >= start; i--, j--) {
      const value = values[i]!;
      unstableChain[j] = unstableLookup.get(value);
      unstableLookup.set(value, j);
    }

    indexedDisposers.length = nextSize;
    indexedNodes.length = nextSize;

    let unstableUnusedCount = unstableSize;

    for (i = start; i < nextSize; i++) {
      const value = nextValues[i]!;
      const unstableIndex = unstableLookup.get(value);
      if (unstableIndex === undefined) {
        indexedDisposers[i] = [];
        renderTemplate(
          map(value),
          context,
          // TODO: should this be push.bind instead?
          indexedRegDispose,
          null,
          indexedAppend
        );

        continue;
      }

      unstableLookup.set(value, unstableChain[unstableIndex]);

      const node = unstableNodes[unstableIndex]!;
      const disposers = unstableDisposers[unstableIndex]!;
      unstableDisposers[unstableIndex] = emptyArray;
      unstableUnusedCount--;

      indexedDisposers[i] = disposers;
      indexedNodes[i] = node;
      append(node);
    }

    if (unstableUnusedCount > 0) {
      disposeIndexed(unstableDisposers);
      // requestIdleCallback(() => disposeIndexed(unstableDisposers));
    }

    size = nextSize;
    values = nextValues.slice();
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
