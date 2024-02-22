import type { AtomArray } from '@metron/core/collections/array.js';
import { controlledForkContext, type Context } from '../context.js';
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
  TEMPLATE_BLUEPRINTS,
  createElementFromTemplateBlueprints,
  type TemplateComponent,
  type TemplateBlueprints,
} from './template.js';
import type { NodeInitializer } from './element.js';
import {
  IS_NODE,
  NODE_TYPE_ADVANCED,
  type JSXProps,
  type JSXAdvancedNode,
} from '../node.js';

function disposeIndexed(indexedDisposers: Disposer[][]) {
  for (let i = 0; i < indexedDisposers.length; i++) {
    const disposers = indexedDisposers[i]!;
    for (let j = 0; j < disposers.length; j++) {
      disposers[j]!();
    }
  }
}

const emptyArray = [] as [];

class ElementChildrenSynchronizer<TValue extends JSXProps> {
  #indexedDisposers: Disposer[][] = [];
  #indexedElements: ChildNode[] = [];
  #array: AtomArray<TValue>;
  #changeStore: ReadonlyArrayChangeStore;
  #changeToken: symbol;
  #refreshToken: symbol;
  #cache: TValue[];
  #context: Context;
  #parent: ParentNode;
  #blueprints: TemplateBlueprints;
  #marker: null | ChildNode;
  #disposeSubscription: Disposer;
  #range: Range | undefined;
  #clear: () => void;

  private constructor(
    parent: ParentNode,
    array: AtomArray<TValue>,
    context: Context,
    template: TemplateComponent<TValue>,
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
    this.#blueprints = template[TEMPLATE_BLUEPRINTS];
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
    const indexedElements = this.#indexedElements,
      cache = this.#cache,
      indexedDisposers = this.#indexedDisposers,
      context = this.#context,
      parent = this.#parent,
      blueprints = this.#blueprints,
      marker = this.#marker;

    const length = cache.length;
    indexedElements.length = length;
    indexedDisposers.length = length;
    for (; start < length; start++) {
      const disposers: Disposer[] = [];
      const element = createElementFromTemplateBlueprints(
        blueprints,
        cache[start]!,
        controlledForkContext(context, disposers)
      );
      indexedElements[start] = element;
      indexedDisposers[start] = disposers;
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
    const unstableDisposers = indexedDisposers.slice(start);
    const unstableNodes = indexedElements.slice(start);
    const unstableSize = unstableNodes.length;
    const unstableLookup = new Map<TValue, number | undefined>();
    const unstableChain: (number | undefined)[] = new Array(unstableSize);
    const blueprints = this.#blueprints;
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
        const element = createElementFromTemplateBlueprints(
          blueprints,
          value,
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
    const element = createElementFromTemplateBlueprints(
      this.#blueprints,
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
    const element = createElementFromTemplateBlueprints(
      this.#blueprints,
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
  static sync<TValue extends JSXProps>(
    parent: ParentNode,
    array: AtomArray<TValue>,
    context: Context,
    as: TemplateComponent<TValue>,
    marker?: null | ChildNode
  ): Disposer {
    const synchronizer = new ElementChildrenSynchronizer(
      parent,
      array,
      context,
      // TODO
      as as any,
      marker ?? null
    );
    return synchronizer.#dispose.bind(synchronizer);
  }
}

export const syncElementChildren = ElementChildrenSynchronizer.sync;

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

function renderAtomArray<TValue extends {}>(
  props: ForProps<TValue>,
  context: Context,
  append: (child: ChildNode) => void,
  parent: ParentNode | undefined
): undefined {
  const array = props.each;
  const createElement = props.as;

  if (parent === undefined) {
    const marker = document.createTextNode('');
    append(marker);
    parent = marker.parentElement!;

    if (parent == null) {
      throw Error('TODO: Hmm... need to rethink jsx rendering');
    }

    context.register(
      syncElementChildren(parent, array, context, createElement, marker)
    );

    return;
  }

  context.register(
    syncElementChildren(parent, array, context, createElement, null)
  );
}
