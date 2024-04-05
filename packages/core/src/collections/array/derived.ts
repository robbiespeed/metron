import { createRelayOrb, type Orb } from '@metron/core/orb.js';
import { IS_ATOM_ARRAY, type AtomArray } from '../array.js';
import { Stabilizer } from '../stabilizer.js';
import { ORB, type AtomReader, EMITTER, IS_ATOM } from '@metron/core/atom.js';
import {
  type ReadonlyArrayChangeStore,
  type ArrayChangeUnion,
  ARRAY_CHANGE_STORE,
  ArrayChangeStore,
  HINT_SET,
  HINT_DELETE,
  HINT_SWAP,
  HINT_PUSH,
} from './change-store.js';
import type { Emitter } from '@metron/core/emitter.js';
import { bindableRead } from '../../internal/read.js';
import { emptyCacheToken, type EmptyCacheToken } from '@metron/core/cache.js';
import { moveLeft, moveRight } from '../../internal/array.js';

export const skipToken = Symbol();

export type SkipToken = typeof skipToken;

interface DerivedItem<TIn = unknown, TOut = unknown> {
  inIndex: number;
  inValue: TIn;
  outIndex: number;
  isUnstable: boolean;
  read: AtomReader;
  store: TOut | SkipToken | EmptyCacheToken;
  tempNext: DerivedItem<TIn, TOut> | undefined;
}

type ChangeHandlerRecord = {
  [C in ArrayChangeUnion as C['hint']]?: <TIn, TOut>(
    derived: DerivedAtomArray<TIn, TOut>,
    inputValues: readonly TIn[],
    change: C
  ) => undefined;
};

function adjustOutIndexes(
  items: DerivedItem[],
  start: number,
  end: number,
  amount: number
): undefined {
  for (let i = start; i < end; i++) {
    const item = items[i]!;
    if (item.outIndex > 0) {
      item.outIndex += amount;
    }
  }
}

function adjustOutIndexesAndFindLowest(
  items: DerivedItem[],
  start: number,
  end: number,
  amount: number
): number {
  let lowest = end;
  let i = start;
  while (i < end) {
    const item = items[i]!;
    i++;
    const { outIndex } = item;
    if (outIndex >= 0) {
      item.outIndex += amount;
      if (outIndex < lowest) {
        lowest = outIndex;
        break;
      }
    }
  }
  if (i < end) {
    adjustOutIndexes(items, i, end, amount);
  }

  return lowest;
}

function adjustOutIndexesAndFindHighest(
  items: DerivedItem[],
  start: number,
  end: number,
  amount: number
): number {
  let highest = start;
  let i = end - 1;
  while (i >= start) {
    const item = items[i]!;
    i--;
    const { outIndex } = item;
    if (outIndex >= 0) {
      item.outIndex += amount;
      if (outIndex > highest) {
        highest = outIndex;
        break;
      }
    }
  }
  if (i >= start) {
    adjustOutIndexes(items, start, i + 1, amount);
  }
  return highest;
}

// const emptyArray: [] = [];

class DerivedAtomArray<TIn, TOut> implements AtomArray<TOut> {
  // #inValues: TIn[] = emptyArray;
  #outValues: TOut[] = [];
  #derivedItems: DerivedItem<TIn, TOut>[] = [];
  #unstableItems: DerivedItem<TIn, TOut>[] = [];
  #changeStore = new ArrayChangeStore();
  #input: AtomArray<TIn>;
  #inputChangeToken: symbol = emptyCacheToken;
  /**
   * TTIn generic needed to allow instance to be assignable to wider typed DerivedAtomArray
   * @see https://github.com/microsoft/TypeScript/issues/57209
   */
  #fn: <TTIn extends TIn>(value: TTIn, read: AtomReader) => TOut | SkipToken;

  #stabilizer: Stabilizer;
  #orb: Orb;
  constructor(
    input: AtomArray<TIn>,
    fn: (value: TIn, read: AtomReader) => TOut | SkipToken
  ) {
    this.#input = input;
    this.#fn = fn;

    const stabilizer = new Stabilizer(
      DerivedAtomArray.#bindableStabilize.bind<(this: this) => undefined>(this)
    );
    this.#stabilizer = stabilizer;
    this.#orb = createRelayOrb(stabilizer, Stabilizer.intercept, [input[ORB]]);
  }
  get [IS_ATOM](): true {
    return true;
  }
  get [IS_ATOM_ARRAY](): true {
    return true;
  }
  get [ORB](): Orb {
    return this.#orb;
  }
  get [EMITTER](): Emitter {
    return this.#stabilizer.emitter;
  }
  get [ARRAY_CHANGE_STORE](): ReadonlyArrayChangeStore {
    return this.#changeStore;
  }
  unwrap(): readonly TOut[] {
    this.#stabilizer.stabilize();
    return this.#outValues;
  }
  #stabilizeItems() {
    const derivedItems = this.#derivedItems;
    const derivedItemsLength = derivedItems.length;
    const outValues = this.#outValues;
    const unstableItems = this.#unstableItems;
    const end = unstableItems.length;
    for (let i = 0; i < end; i++) {
      const item = unstableItems[i]!;
      if (item.isUnstable) {
        const outValue = this.#fn(item.inValue, item.read);
        item.store = outValue;
        item.isUnstable = false;
        if (outValue === skipToken) {
          if (item.outIndex !== -1) {
            outValues.splice(item.outIndex, 1);
            item.outIndex = -1;
            adjustOutIndexes(
              derivedItems,
              item.inIndex + 1,
              derivedItemsLength,
              -1
            );
            // TODO: localChangeStore.index(HINT_DELETE, outIndex);
          }
        } else if (item.outIndex === -1) {
          const outIndex = adjustOutIndexesAndFindLowest(
            derivedItems,
            item.inIndex + 1,
            derivedItemsLength,
            1
          );
          item.outIndex = outIndex;
          outValues.splice(outIndex, 0, outValue);
          // TODO: localChangeStore.index(HINT_INSERT, outIndex);
        } else {
          // TODO: localChangeStore.index(HINT_SET, outIndex);
        }
      }
    }
  }
  static #changeHandlers: ChangeHandlerRecord = {
    [HINT_SET](derived, inputValues, change): undefined {
      const index = change.start;
      const derivedItems = derived.#derivedItems;
      const item = derivedItems[index]!;
      const inValue = inputValues[index]!;
      item.inValue = inValue;
      const outValue = derived.#fn(inValue, item.read);
      item.store = outValue;
      item.isUnstable = false;
      if (outValue === skipToken) {
        if (item.outIndex !== -1) {
          item.outIndex = -1;
          adjustOutIndexes(derivedItems, index + 1, derivedItems.length, -1);
          derived.#outValues.splice(index, 1);
          // TODO: set local change store
          return;
        }
      } else if (item.outIndex === -1) {
        item.outIndex = adjustOutIndexesAndFindLowest(
          derivedItems,
          index + 1,
          derivedItems.length,
          1
        );
        derived.#outValues.splice(index, 0, outValue);
        // TODO: set local change store
        return;
      }
      // TODO: set local change store
    },
    [HINT_DELETE](derived, inputValues, change) {
      const index = change.start;
      const derivedItems = derived.#derivedItems;
      const item = derived.#derivedItems[index]!;
      item.isUnstable = false;
      if (item.outIndex !== -1) {
        adjustOutIndexes(derivedItems, index + 1, derivedItems.length, -1);
        derived.#outValues.splice(item.outIndex, 1);
        // TODO: set local change store
      }
      derivedItems.splice(index, 1);
    },
    [HINT_SWAP](derived, inputValues, change) {
      const derivedItems = derived.#derivedItems;
      const outValues = derived.#outValues;

      const a = change.start;
      const b = change.data;

      const aItem = derivedItems[a]!;
      const bItem = derivedItems[b]!;
      aItem.inIndex = b;
      bItem.inIndex = a;
      derivedItems[a] = bItem;
      derivedItems[b] = aItem;

      const aOutIndex = aItem.outIndex;
      const bOutIndex = bItem.outIndex;

      if (aOutIndex >= 0) {
        if (bOutIndex >= 0) {
          // Optimal swap
          aItem.outIndex = bOutIndex;
          bItem.outIndex = aOutIndex;
          const tmpValue = outValues[a]!;
          outValues[a] = outValues[b]!;
          outValues[b] = tmpValue;
          // TODO: localChangeStore.swap
          return;
        }

        // move a to the right
        const outIndex = adjustOutIndexesAndFindHighest(
          derivedItems,
          a + 1,
          b,
          -1
        );
        aItem.outIndex = outIndex;
        moveRight(outValues, aOutIndex, outIndex, 1);
        // TODO: localChangeStore.moveRight
        return;
      } else if (bOutIndex >= 0) {
        // move b to the left
        const outIndex = adjustOutIndexesAndFindLowest(
          derivedItems,
          a + 1,
          b,
          1
        );
        bItem.outIndex = outIndex;
        moveLeft(outValues, bOutIndex, outIndex, 1);
        // TODO: localChangeStore.moveLeft
        return;
      }
      // No change
    },
    [HINT_PUSH](derived, inputValues, { start, data }) {
      const derivedItems = derived.#derivedItems;
      const outValues = derived.#outValues;
      const oldOutLength = outValues.length;
      const Item = DerivedAtomArray.#Item;

      const end = start + data;

      for (let i = start; i < end; i++) {
        const inValue = inputValues[i]!;

        const item = new Item(derived, i, inValue);
        derivedItems[i] = item;

        const outValue = item.store;
        if (outValue !== skipToken) {
          item.outIndex = outValues.length;

          // item.store will not be emptyCacheToken at this stage
          outValues.push(outValue as (typeof outValues)[number]);
        }
      }
      const outCount = outValues.length - oldOutLength;
      if (outCount > 0) {
        // TODO: localChangeStore.push(oldOutLength, outCount)
      }
    },
  };
  static #bindableStabilize<TIn, TOut>(
    this: DerivedAtomArray<TIn, TOut>
  ): undefined {
    const inputValues = this.#input.unwrap();
    const inputChangeStore = this.#input[ARRAY_CHANGE_STORE];
    const change = inputChangeStore.get(this.#inputChangeToken);
    this.#inputChangeToken = inputChangeStore.nextConnectionToken;

    let start: number;
    let end: number;

    if (change !== undefined) {
      const handler = DerivedAtomArray.#changeHandlers[change.hint];
      if (handler !== undefined) {
        // TS cannot properly determine call signature of union
        handler(this, inputValues, change as never);
        this.#stabilizeItems();
        return;
      }
      start = change.start;
    }

    const outValues = this.#outValues;
    const outSize = outValues.length;
    const inputSize = inputValues.length;
    const derivedItems = this.#derivedItems;
    const Item = DerivedAtomArray.#Item;

    // Init fast path
    if (outSize === 0) {
      for (let i = 0; i < inputSize; i++) {
        const inValue = inputValues[i] as TIn;

        const item = new Item(this, i, inValue);
        derivedItems[i] = item;

        const outValue = item.store;
        if (outValue !== skipToken) {
          item.outIndex = outValues.length;

          // item.store will not be emptyCacheToken at this stage
          outValues.push(outValue as TOut);
        }
      }

      // const outCount = outValues.length - oldOutLength;
      // if (outCount > 0) {
      //   // TODO: localChangeStore.push(oldOutLength, outCount)
      // }
      return;
    }

    const unstableItems = this.#unstableItems;

    // Clear fast path
    if (inputSize === 0) {
      outValues.length = 0;
      derivedItems.length = 0;
      // TODO: would it be worth keeping some unstable items around to recycle.
      unstableItems.length = 0;
      return;
    }

    // TODO: Should there be a mode where itemLookup isn't used and all items are recycled in place?
    // Would potentially speed up full replacements where all inputs are expected to change, and waste less memory..
    // If so where/how would the mode be toggled? On the derivedArray instance?
    // Might not be necessary for regular non derived mapping though.

    // TODO: Might be best to take inValue out of derived item and use a oldInValues array instead
    // This would allow efficient pre/post fix skipping for unchanged items when unable to use change store

    const prevEnd = derivedItems.length;

    end = inputSize > prevEnd ? prevEnd : inputSize;

    // Skip unchanged front values
    for (
      start = 0;
      start < end && inputValues[start] === derivedItems[start]!.inValue;
      start++
    );

    const itemLookup = new Map<TIn, DerivedItem<TIn, TOut> | undefined>();

    let nextOutSize = outSize;
    outValues.length = nextOutSize;

    for (let i = prevEnd - 1; i >= start; i--) {
      const item = derivedItems[i]!;
      const itemOutIndex = item.outIndex;
      if (itemOutIndex > 0) {
        nextOutSize = itemOutIndex;
      }
      const inValue = item.inValue;
      if (inValue !== emptyCacheToken) {
        item.tempNext = itemLookup.get(inValue);
        itemLookup.set(inValue, item);
      }
    }

    derivedItems.length = inputSize;

    for (let i = start; i < inputSize; i++) {
      const inValue = inputValues[i] as TIn;
      let item = itemLookup.get(inValue);
      if (item === undefined) {
        // Recycle unstable items
        if (unstableItems.length > 0) {
          item = unstableItems.pop()!;
          item.inValue = inValue;
          item.store = this.#fn(inValue, item.read);
          item.isUnstable = false;
        } else {
          item = new Item(this, i, inValue);
        }
      } else {
        itemLookup.set(inValue, item.tempNext);
        item.tempNext = undefined;
      }
      derivedItems[i] = item;

      const outValue = item.store;
      if (outValue !== skipToken) {
        item.outIndex = nextOutSize++;

        // item.store will not be emptyCacheToken at this stage
        outValues.push(outValue as TOut);
      }
    }

    // TODO: would it be worth keeping some unstable items around to recycle next run
    unstableItems.length = 0;
  }
  static #Item = class DerivedAtomArrayItem<TIn, TOut>
    implements DerivedItem<TIn, TOut>
  {
    isUnstable = false;
    outIndex = -1;
    tempNext: DerivedItem<TIn, TOut> | undefined = undefined;
    inIndex: number;
    read: AtomReader;
    inValue: TIn;
    store: TOut | EmptyCacheToken | SkipToken;
    #parent: DerivedAtomArray<TIn, TOut>;

    constructor(
      parent: DerivedAtomArray<TIn, TOut>,
      index: number,
      inValue: TIn
    ) {
      this.#parent = parent;
      // TODO: bench whether this is worth it. Might be better to simply always create the orb.
      // DerivedAtomArray should be used in places where read is going to be used anyway.
      const readInit: AtomReader = (atom) => {
        if (this.read === readInit) {
          const orb = createRelayOrb(
            this as DerivedAtomArrayItem<unknown, unknown>,
            DerivedAtomArrayItem.#intercept
          );
          this.read = bindableRead.bind(orb) as AtomReader;
        }
        return this.read(atom);
      };
      this.read = readInit;
      this.inIndex = index;
      this.inValue = inValue;
      this.store = parent.#fn(inValue, readInit);
    }
    static #intercept(this: Orb<DerivedAtomArrayItem<unknown, unknown>>) {
      const d = this.data;
      if (d.isUnstable) {
        return false;
      }
      d.isUnstable = true;
      d.inValue = emptyCacheToken;
      d.store = emptyCacheToken;
      d.#parent.#unstableItems.push(d);
      d.#parent.#stabilizer.destabilize();
      return true;
    }
  };
  static create<TIn, TOut>(
    input: AtomArray<TIn>,
    fn: (value: TIn, read: AtomReader) => TOut | SkipToken
  ) {
    return new DerivedAtomArray(input, fn);
  }
}

export const createDerivedArray = DerivedAtomArray.create;
