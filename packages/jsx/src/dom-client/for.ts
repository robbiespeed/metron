import type { AtomArray } from '@metron/core/collections/array.js';
import { type Context, controlledForkContext } from '../context.js';
import type { Disposer } from '@metron/core/shared.js';
import { EMITTER } from '@metron/core/atom.js';
import {
  ARRAY_CHANGE_STORE,
  HINT_DELETE,
  HINT_INSERT,
  HINT_SET,
  HINT_SWAP,
  type ReadonlyArrayChangeStore,
} from '@metron/core/collections/array/change-store.js';
import {
  NODE_TYPE_UNSAFE,
  type Component,
  type JSXProps,
  IS_NODE,
  type JSXUnsafeNode,
} from '../node.js';

type Template<TValue> = (value: TValue, context: Context) => Element;

function disposeIndexed(indexedDisposers: Disposer[][]) {
  for (let i = 0; i < indexedDisposers.length; i++) {
    const disposers = indexedDisposers[i]!;
    for (let j = 0; j < disposers.length; j++) {
      disposers[j]!();
    }
  }
}

const emptyArray: [] = [];

class ElementChildrenSynchronizer<TValue> {
  #indexedDisposers: Disposer[][] = [];
  #indexedElements: ChildNode[] = [];
  #array: AtomArray<TValue>;
  #changeStore: ReadonlyArrayChangeStore;
  #changeToken: symbol;
  #refreshToken: symbol;
  #cache: TValue[];
  #context: Context;
  #parent: ParentNode;
  #template: Template<TValue>;
  #marker: null | Node;
  #disposeSubscription: Disposer;
  #range: Range | undefined;
  #isOnlyChild: boolean;

  private constructor(
    parent: ParentNode,
    array: AtomArray<TValue>,
    context: Context,
    template: Template<TValue>,
    marker: null | Node
  ) {
    this.#array = array;
    const changeStore = array[ARRAY_CHANGE_STORE];
    this.#changeStore = changeStore;
    this.#changeToken = changeStore.nextConnectionToken;
    this.#refreshToken = changeStore.refreshToken;
    this.#cache = array.unwrap().slice();
    this.#context = context;
    this.#parent = parent;
    this.#template = template;
    if (marker === parent) {
      this.#isOnlyChild = true;
      this.#marker = null;
    } else {
      this.#isOnlyChild = false;
      const internalMarker = document.createTextNode('');
      parent.insertBefore(internalMarker, marker);
      this.#marker = internalMarker;
    }

    this.#disposeSubscription = array[EMITTER].subscribe(
      this.#changeHandler.bind(this)
    );

    if (this.#cache.length > 0) {
      this.#append(0);
    }
  }
  #dispose(): undefined {
    this.#disposeSubscription();
    disposeIndexed(this.#indexedDisposers);
  }
  #changeHandler(): undefined {
    const next = this.#array.unwrap(),
      changeStore = this.#changeStore,
      prev = this.#cache;

    const nextSize = next.length;
    const prevToken = this.#changeToken;
    this.#changeToken = changeStore.nextConnectionToken;

    // Clear fast path
    if (nextSize === 0) {
      if (prev.length === 0) {
        return;
      }
      disposeIndexed(this.#indexedDisposers);
      this.#cache = [];
      this.#indexedDisposers.length = 0;
      this.#indexedElements.length = 0;
      this.#clear();
      return;
    }
    this.#cache = next.slice();

    // Replace fast path
    if (this.#refreshToken !== changeStore.refreshToken) {
      this.#refreshToken = changeStore.refreshToken;
      if (prev.length > 0) {
        disposeIndexed(this.#indexedDisposers);
        this.#clear();
      }

      this.#append(0);
      return;
    }

    let start;
    const change = changeStore.get(prevToken);

    if (change !== undefined) {
      switch (change.hint) {
        case HINT_DELETE:
          this.#delete(change.start);
          return;
        case HINT_INSERT:
          this.#insert(change.start);
          return;
        case HINT_SET:
          this.#set(change.start);
          return;
        case HINT_SWAP:
          this.#swap(change.start, change.data);
          return;
      }
      start = change.start;
    }

    const prevSize = prev.length;

    // Skip unchanged head values
    const lowEnd = nextSize > prevSize ? prevSize : nextSize;
    for (start = 0; start < lowEnd && prev[start] === next[start]; start++);

    // Append fast path
    if (start === prevSize) {
      this.#append(start);
      return;
    }

    this.#fallback(start, prev);
  }
  #append(start: number) {
    const indexedElements = this.#indexedElements;
    const cache = this.#cache;
    const indexedDisposers = this.#indexedDisposers;
    const context = this.#context;
    const parent = this.#parent;
    const template = this.#template;
    const marker = this.#marker;

    const length = cache.length;
    indexedElements.length = length;
    indexedDisposers.length = length;
    for (; start < length; start++) {
      const datum = cache[start]!;
      const disposers: Disposer[] = [];
      const element = template(
        datum,
        controlledForkContext(context, disposers)
      );
      indexedElements[start] = element;
      indexedDisposers[start] = disposers;
      parent.insertBefore(element, marker);
    }
  }
  #clear() {
    if (this.#isOnlyChild) {
      this.#parent.textContent = '';
      return;
    }
    this.#clearRange(0, this.#indexedElements.length);
  }
  #clearRange(start: number, end: number) {
    const range = (this.#range ??= document.createRange());
    range.setStartBefore(this.#indexedElements[start]!);
    range.setEndAfter(this.#indexedElements[end - 1]!);
    range.deleteContents();
  }
  #delete(index: number) {
    const disposers = this.#indexedDisposers[index]!;
    for (let j = 0; j < disposers.length; j++) {
      disposers[j]!();
    }
    const element = this.#indexedElements[index]!;
    this.#indexedElements.splice(index, 1);
    this.#indexedDisposers.splice(index, 1);
    this.#parent.removeChild(element);
  }
  #fallback(start: number, prevValues: TValue[]) {
    const values = this.#cache;
    const size = values.length;
    const prevSize = prevValues.length;

    // Clear DOM from start to avoid shuffling
    if (start === 0) {
      this.#clear();
    } else if (start < prevSize) {
      this.#clearRange(start, prevSize);

      // Trim fast path
      if (start === size) {
        disposeIndexed(this.#indexedDisposers.splice(start));
        this.#indexedElements.length = size;
        this.#indexedDisposers.length = size;
        return;
      }
    } else if (start === size) {
      // No change
      return;
    }

    // Create a lookup chain for unstable nodes
    // Use the lookup to append existing nodes back into the DOM
    // Nodes which share the same value get added back in order

    const indexedDisposers = this.#indexedDisposers;
    const indexedElements = this.#indexedElements;
    const unstableDisposers: Disposer[][] = indexedDisposers.slice(start);
    const unstableNodes = indexedElements.slice(start);
    const unstableSize = unstableNodes.length;
    const unstableLookup = new Map<TValue, number | undefined>();
    const unstableChain: (number | undefined)[] = new Array(unstableSize);
    const template = this.#template;
    const parent = this.#parent;
    const marker = this.#marker;
    const context = this.#context;

    indexedElements.length = size;
    indexedDisposers.length = size;

    let i = prevSize - 1;
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
        const element = template(
          values[i]!,
          controlledForkContext(context, disposers)
        );
        indexedElements[i] = element;
        indexedDisposers[i] = disposers;
        parent.insertBefore(element, marker);

        continue;
      }

      unstableLookup.set(value, unstableChain[unstableIndex]);

      const node = unstableNodes[unstableIndex]!;
      const disposers = unstableDisposers[unstableIndex]!;
      unstableDisposers[unstableIndex] = emptyArray;
      unstableUnusedCount--;

      indexedDisposers[i] = disposers;
      indexedElements[i] = node;
      parent.insertBefore(node, marker);
    }

    if (unstableUnusedCount > 0) {
      disposeIndexed(unstableDisposers);
    }
  }
  #insert(index: number) {
    const disposers: Disposer[] = [];
    const element = this.#template(
      this.#cache[index]!,
      controlledForkContext(this.#context, disposers)
    );
    const next = this.#indexedElements[index]!;
    this.#indexedElements.splice(index, 0, element);
    this.#indexedDisposers.splice(index, 0, disposers);

    this.#parent!.insertBefore(element, next);
  }
  #set(index: number) {
    const nextDisposers: Disposer[] = [];
    const prevDisposers = this.#indexedDisposers[index]!;
    for (let j = 0; j < prevDisposers.length; j++) {
      prevDisposers[j]!();
    }
    const element = this.#template(
      this.#cache[index]!,
      controlledForkContext(this.#context, nextDisposers)
    );
    const prevElement = this.#indexedElements[index]!;
    this.#indexedElements[index] = element;
    this.#indexedDisposers[index] = nextDisposers;

    this.#parent!.replaceChild(element, prevElement);
  }
  #swap(a: number, b: number) {
    const elements = this.#indexedElements;

    const aNode = elements[a]!;
    const bNode = elements[b]!;

    elements[a] = bNode;
    elements[b] = aNode;

    const tmpD = this.#indexedDisposers[a]!;
    this.#indexedDisposers[a] = this.#indexedDisposers[b]!;
    this.#indexedDisposers[b] = tmpD;

    const afterB = bNode.nextSibling;

    this.#parent.insertBefore(bNode, aNode);
    this.#parent.insertBefore(aNode, afterB);
  }
  // static render<TValue>(
  //   parent: ParentNode,
  //   array: AtomArray<TValue>,
  //   context: JSXContext,
  //   as: Template<TValue>,
  //   marker?: null | ChildNode
  // ): Disposer {
  //   const synchronizer = new ElementChildrenSynchronizer(
  //     parent,
  //     array,
  //     context,
  //     as,
  //     marker ?? null
  //   );

  //   return ;
  // }
  static sync<TValue>(
    parent: ParentNode,
    array: AtomArray<TValue>,
    context: Context,
    as: Template<TValue>,
    marker: null | ChildNode
  ): Disposer {
    const synchronizer = new ElementChildrenSynchronizer(
      parent,
      array,
      context,
      as,
      marker
    );
    return synchronizer.#dispose.bind(synchronizer);
  }
}

export const syncElementChildren = ElementChildrenSynchronizer.sync;

interface ForProps<TValue extends JSXProps> {
  each: AtomArray<TValue>;
  as: Component<TValue, Element>;
}

export function For<TValue extends JSXProps>(
  props: ForProps<TValue>
): JSXUnsafeNode<ForProps<TValue>> {
  return {
    [IS_NODE]: true,
    nodeType: NODE_TYPE_UNSAFE,
    props,
    // TODO
    tag: renderAtomArray as any,
  };
}

function renderAtomArray<TValue extends {}>(
  props: ForProps<TValue>,
  context: Context,
  parent: ParentNode,
  marker: ChildNode | null
): undefined {
  context.register(
    syncElementChildren(parent, props.each, context, props.as, marker)
  );
}
