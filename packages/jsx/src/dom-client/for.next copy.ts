import type { AtomArray } from '@metron/core/collections/array.js';
import {
  disposeContexts,
  type Context,
  disposeContext,
  disposeSparseContexts,
  forkContext,
} from '../context.js';
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

type Template<TValue> = (value: TValue, context: Context) => Element;

class ElementChildrenSynchronizer<TValue> {
  #indexedContexts: Context[] = [];
  #indexedElements: ChildNode[] = [];
  #array: AtomArray<TValue>;
  #changeStore: ReadonlyArrayChangeStore;
  #changeToken: symbol;
  #refreshToken: symbol;
  #cache: TValue[];
  #context: Context;
  #parent: ParentNode;
  #template: Template<TValue>;
  #marker: null | ChildNode;
  #disposeSubscription: Disposer;
  #range: Range | undefined;
  #clear: () => void;

  private constructor(
    parent: ParentNode,
    array: AtomArray<TValue>,
    context: Context,
    template: Template<TValue>,
    marker: null | ChildNode
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
    this.#marker = marker;
    this.#clear = marker === null ? this.#clearParent : this.#clearToTail;

    this.#disposeSubscription = array[EMITTER].subscribe(
      this.#changeHandler.bind(this)
    );

    if (this.#cache.length > 0) {
      this.#append(0);
    }
  }
  #dispose(): undefined {
    this.#disposeSubscription();
    disposeContexts(this.#indexedContexts);
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
      disposeContexts(this.#indexedContexts);
      this.#cache = [];
      this.#indexedContexts.length = 0;
      this.#indexedElements.length = 0;
      this.#clear();
      return;
    }
    this.#cache = next.slice();

    // Replace fast path
    if (this.#refreshToken !== changeStore.refreshToken) {
      this.#refreshToken = changeStore.refreshToken;
      if (prev.length > 0) {
        disposeContexts(this.#indexedContexts);
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
    const indexedElements = this.#indexedElements,
      cache = this.#cache,
      indexedContexts = this.#indexedContexts,
      context = this.#context,
      parent = this.#parent,
      template = this.#template,
      marker = this.#marker;

    const length = cache.length;
    indexedElements.length = length;
    indexedContexts.length = length;
    for (; start < length; start++) {
      const datum = cache[start]!;
      const childContext = forkContext(context);
      const element = template(datum, childContext);
      indexedElements[start] = element;
      indexedContexts[start] = childContext;
      parent.insertBefore(element, marker);
    }
  }
  #clearParent() {
    this.#parent.textContent = '';
  }
  #clearToTail() {
    const range = (this.#range ??= document.createRange());
    range.setStartBefore(this.#indexedElements[0]!);
    range.setEndBefore(this.#marker!);
    range.deleteContents();
  }
  #clearRange(start: number, end: number) {
    const range = (this.#range ??= document.createRange());
    range.setStartBefore(this.#indexedElements[start]!);
    range.setEndAfter(this.#indexedElements[end - 1]!);
    range.deleteContents();
  }
  #delete(index: number) {
    disposeContext(this.#indexedContexts[index]!);
    const element = this.#indexedElements[index]!;
    this.#indexedElements.splice(index, 1);
    this.#indexedContexts.splice(index, 1);
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
        disposeContexts(this.#indexedContexts.splice(start));
        this.#indexedElements.length = size;
        this.#indexedContexts.length = size;
        return;
      }
    } else if (start === size) {
      // No change
      return;
    }

    // Create a lookup chain for unstable nodes
    // Use the lookup to append existing nodes back into the DOM
    // Nodes which share the same value get added back in order

    const indexedContexts = this.#indexedContexts;
    const indexedElements = this.#indexedElements;
    const unstableContexts: (Context | undefined)[] =
      indexedContexts.slice(start);
    const unstableNodes = indexedElements.slice(start);
    const unstableSize = unstableNodes.length;
    const unstableLookup = new Map<TValue, number | undefined>();
    const unstableChain: (number | undefined)[] = new Array(unstableSize);
    const template = this.#template;
    const parent = this.#parent;
    const marker = this.#marker;
    const context = this.#context;

    indexedElements.length = size;
    indexedContexts.length = size;

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
        const childContext = forkContext(context);
        const element = template(values[i]!, childContext);
        indexedElements[i] = element;
        indexedContexts[i] = childContext;
        parent.insertBefore(element, marker);

        continue;
      }

      unstableLookup.set(value, unstableChain[unstableIndex]);

      const node = unstableNodes[unstableIndex]!;
      const disposers = unstableContexts[unstableIndex]!;
      unstableContexts[unstableIndex] = undefined;
      unstableUnusedCount--;

      indexedContexts[i] = disposers;
      indexedElements[i] = node;
      parent.insertBefore(node, marker);
    }

    if (unstableUnusedCount > 0) {
      disposeSparseContexts(unstableContexts);
    }
  }
  #insert(index: number) {
    const childContext = forkContext(this.#context);
    const element = this.#template(this.#cache[index]!, childContext);
    const next = this.#indexedElements[index]!;
    this.#indexedElements.splice(index, 0, element);
    this.#indexedContexts.splice(index, 0, childContext);

    this.#parent!.insertBefore(element, next);
  }
  #set(index: number) {
    disposeContext(this.#indexedContexts[index]!);
    const childContext = forkContext(this.#context);
    const element = this.#template(this.#cache[index]!, childContext);
    const prevElement = this.#indexedElements[index]!;
    this.#indexedElements[index] = element;
    this.#indexedContexts[index] = childContext;

    this.#parent!.replaceChild(element, prevElement);
  }
  #swap(a: number, b: number) {
    const elements = this.#indexedElements;

    const aNode = elements[a]!;
    const bNode = elements[b]!;

    elements[a] = bNode;
    elements[b] = aNode;

    const tmpD = this.#indexedContexts[a]!;
    this.#indexedContexts[a] = this.#indexedContexts[b]!;
    this.#indexedContexts[b] = tmpD;

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
    marker?: null | ChildNode
  ): Disposer {
    const synchronizer = new ElementChildrenSynchronizer(
      parent,
      array,
      context,
      as,
      marker ?? null
    );
    return synchronizer.#dispose.bind(synchronizer);
  }
}

export const syncElementChildren = ElementChildrenSynchronizer.sync;
