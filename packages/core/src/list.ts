import {
  ATOM_COLLECTION_EMIT_SIZED_TYPES,
  COLLECTION_EMIT_TYPE_ALL_CHANGE,
  COLLECTION_EMIT_TYPE_KEY,
  collectionValueAtKey,
  type AtomCollection,
  type AtomCollectionEmitMap,
  type AtomCollectionSizedEmit,
  type RawAtomCollection,
} from './collection.js';
import { filterEmitter } from './filter-emitter.js';
import { atomIteratorKey, type AtomIterator } from './iterable.js';
import { emitterKey, toValueKey, type Atom } from './particle.js';
import { createSensor } from './sensor.js';

export const LIST_EMIT_TYPE_SLICE = 'ListSliceEmit';
export const LIST_EMIT_TYPE_SLICE_SWAP = 'ListSliceSwapEmit';
export const LIST_EMIT_TYPE_SORT = 'ListSortEmit';
export const LIST_EMIT_TYPE_REVERSE = 'ListReverseEmit';

export interface AtomListSliceRange {
  readonly start: number;
  readonly end: number;
}

export interface AtomListEmitSlice extends AtomListSliceRange {
  readonly type: typeof LIST_EMIT_TYPE_SLICE;
  readonly newSize: number;
  readonly oldSize: number;
}

export interface AtomListEmitSliceSwap {
  readonly type: typeof LIST_EMIT_TYPE_SLICE_SWAP;
  readonly swap: readonly [AtomListSliceRange, AtomListSliceRange];
}

export interface AtomListEmitSort {
  readonly type: typeof LIST_EMIT_TYPE_SORT;
  readonly keyMapping: number[];
}

export interface AtomListEmitReverse {
  readonly type: typeof LIST_EMIT_TYPE_REVERSE;
}

export interface AtomListEmitMap extends AtomCollectionEmitMap<number> {
  slice: AtomListEmitSlice;
  sliceSwap: AtomListEmitSliceSwap;
  sort: AtomListEmitSort;
  reverse: AtomListEmitReverse;
}

export type AtomListEmit = AtomListEmitMap[keyof AtomListEmitMap];

export type AtomListSizedEmit =
  | AtomCollectionSizedEmit<number>
  | AtomListEmitSlice;

export const ATOM_LIST_EMIT_SIZED_TYPES = {
  ...ATOM_COLLECTION_EMIT_SIZED_TYPES,
  [LIST_EMIT_TYPE_SLICE]: true,
  [LIST_EMIT_TYPE_SLICE_SWAP]: false,
  [LIST_EMIT_TYPE_SORT]: false,
  [LIST_EMIT_TYPE_REVERSE]: false,
} as const;

export function isAtomListSizeEmit(
  emit: AtomListEmit
): emit is AtomListSizedEmit {
  return (ATOM_LIST_EMIT_SIZED_TYPES as any)[emit.type] === true;
}

const atomListBrandKey = Symbol('MetronAtomListBrand');

export function isAtomList(value: unknown): value is AtomList<unknown> {
  return (value as any)?.[atomListBrandKey] === true;
}

export interface AtomList<T>
  extends AtomCollection<T, number, RawAtomList<T>, AtomListEmitMap> {
  readonly [atomListBrandKey]: true;
  at(index: number): Atom<T | undefined>;
  /* TODO: Implement these methods.
  slice(start?: number, end?: number): DerivedAtomList<T>;
  sliceReversed(start?: number, end?: number): DerivedAtomList<T>;
  entriesReversed(): AtomIterator<[number, T]>;
  keysReversed(): AtomIterator<number>;
  valuesReversed(): AtomIterator<T>;
  */
}

export interface RawAtomList<T> extends RawAtomCollection<T, number> {
  at(index: number): T | undefined;
  toArray(): T[];
  /* TODO: Implement these methods.
  slice(start?: number, end?: number): IterableIterator<T>;
  sliceReversed(start?: number, end?: number): IterableIterator<T>;
  entriesReversed(): IterableIterator<[number, T]>;
  keysReversed(): IterableIterator<number>;
  valuesReversed(): IterableIterator<T>;

  // These should be utility functions that operate on Iterators.
  // Then similar functions for use on AtomIterators can be created.
  find(predicate: (value: T, index: number, obj: T[]) => unknown, thisArg?: any): T | undefined;
  filter(predicate: (value: T, index: number, obj: T[]) => unknown, thisArg?: any): T[];
  map<U>(callbackfn: (value: T, index: number, array: T[]) => U, thisArg?: any): U[];
  reduce(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: T[]) => T): T;
  some(predicate: (value: T, index: number, obj: T[]) => unknown, thisArg?: any): boolean;
  every(predicate: (value: T, index: number, obj: T[]) => unknown, thisArg?: any): boolean;
  forEach(callbackfn: (value: T, index: number, array: T[]) => void, thisArg?: any): void;
  includes(searchElement: T): boolean;
  join(separator?: string): string;
  */
}

export interface AtomListWriter<T> {
  set(index: number, value: T): T;
  push(value: T): void;
  append(...values: T[]): void;
  insert(index: number, item: T): void;
  splice(start: number, deleteCount: number, items?: T[]): T[];
  pop(): T | undefined;
  /* TODO:
  swap(indexA: number, indexB: number): void;
  */
  replace(...values: T[]): void;
  clear(): void;
}

const SET_INDEX_OUT_OF_BOUNDS_MESSAGE =
  'Index out of bounds, must be an integer between 0 and size';

export function createAtomList<T>(
  ...values: T[]
): [list: AtomList<T>, listUpdater: AtomListWriter<T>] {
  let innerValues = values;

  function rawAt(index: number) {
    const size = innerValues.length;
    let normalizedIndex = Math.trunc(index);
    normalizedIndex =
      normalizedIndex < 0 ? size + normalizedIndex : normalizedIndex;
    return innerValues[index];
  }

  const rawList: RawAtomList<T> = {
    get size() {
      return innerValues.length;
    },
    at: rawAt,
    [collectionValueAtKey]: rawAt,
    toArray() {
      return innerValues.slice();
    },
    [Symbol.iterator]() {
      return innerValues.values();
    },
    entries() {
      return innerValues.entries();
    },
    keys() {
      return innerValues.keys();
    },
    values() {
      return innerValues.values();
    },
  };

  const { emitter: listEmitter, send } = createSensor<AtomListEmit>();

  /* TODO:
  Abstract this finalization logic into a reusable keyed memo function
  (in it's own package) that can be used for creating keyed particles for
  AtomMap and AtomSet.
  Try without memoizing (always fresh particle), and with lifetime management
*/
  const weakAtoms = new Map<number, WeakRef<Atom<T | undefined>>>();

  const finalizationRegistry = new FinalizationRegistry((index: number) => {
    weakAtoms.delete(index);
  });

  function getKeyedParticle(key: number) {
    const weakAtom = weakAtoms.get(key);
    let atom: Atom<T | undefined> | undefined;
    if (weakAtom) {
      atom = weakAtom.deref();
    }

    if (!atom) {
      atom = {
        [toValueKey]() {
          return rawList.at(key);
        },
        [emitterKey]: filterEmitter(
          listEmitter,
          key < 0 ? filterForNegativeKey(key) : filterForPositiveKey(key)
        ),
      };
      const freshWeakAtom = new WeakRef(atom);

      finalizationRegistry.register(atom, key);

      weakAtoms.set(key, freshWeakAtom);
    }

    return atom;
  }

  const sizeAtom: Atom<number> = {
    [toValueKey]() {
      return rawList.size;
    },
    [emitterKey]: filterEmitter(
      listEmitter,
      (change) =>
        change.type === COLLECTION_EMIT_TYPE_ALL_CHANGE &&
        change.newSize !== change.oldSize
    ),
  };

  const iteratorAtom: AtomIterator<T, AtomListEmit> = {
    [toValueKey]() {
      return rawList.values();
    },
    [emitterKey]: listEmitter,
  };

  const entriesIteratorAtom: AtomIterator<[number, T], AtomListEmit> = {
    [toValueKey]() {
      return rawList.entries();
    },
    [emitterKey]: listEmitter,
  };

  const keysIteratorAtom: AtomIterator<number, AtomListEmit> = {
    [toValueKey]() {
      return rawList.keys();
    },
    [emitterKey]: listEmitter,
  };

  function at(index: number) {
    return getKeyedParticle(Math.trunc(index));
  }

  const list: AtomList<T> = {
    [atomListBrandKey]: true,
    [collectionValueAtKey]: at,
    at,
    get size() {
      return sizeAtom;
    },
    [toValueKey]() {
      return rawList;
    },
    [emitterKey]: listEmitter,
    [atomIteratorKey]() {
      return iteratorAtom;
    },
    entries() {
      return entriesIteratorAtom;
    },
    keys() {
      return keysIteratorAtom;
    },
    values() {
      return iteratorAtom;
    },
  };

  const listUpdater: AtomListWriter<T> = {
    set(index, value) {
      const oldSize = innerValues.length;
      let normalizedIndex = Math.trunc(index);
      normalizedIndex =
        normalizedIndex < 0 ? oldSize + normalizedIndex : normalizedIndex;
      if (normalizedIndex < 0 || normalizedIndex > oldSize) {
        throw new Error(SET_INDEX_OUT_OF_BOUNDS_MESSAGE);
      }

      if (value !== innerValues[index]) {
        innerValues[index] = value;

        send({
          type: COLLECTION_EMIT_TYPE_KEY,
          key: index,
          oldSize,
          newSize: innerValues.length,
        });
      }
      return value;
    },
    push(value) {
      innerValues.push(value);
      const oldSize = innerValues.length - 1;
      send({
        type: COLLECTION_EMIT_TYPE_KEY,
        key: oldSize,
        oldSize,
        newSize: innerValues.length,
      });
    },
    append(...values) {
      const oldSize = innerValues.length;

      innerValues.push(...values);

      const newSize = innerValues.length;

      send({
        type: LIST_EMIT_TYPE_SLICE,
        start: oldSize,
        end: newSize - 1,
        oldSize,
        newSize,
      });
    },
    insert(index, item) {
      const oldSize = innerValues.length;
      if (index === oldSize) {
        return this.push(item);
      }

      innerValues.splice(index, 0, item);

      const newSize = innerValues.length;

      send({
        type: LIST_EMIT_TYPE_SLICE,
        start: index,
        end: newSize - 1,
        oldSize,
        newSize,
      });
    },
    splice(start, deleteCount, items = []) {
      const oldSize = innerValues.length;
      const deletedItems = innerValues.splice(start, deleteCount, ...items);
      const newSize = innerValues.length;
      send({
        type: LIST_EMIT_TYPE_SLICE,
        start: start,
        end: newSize - 1,
        oldSize,
        newSize,
      });
      return deletedItems;
    },
    pop() {
      const oldSize = innerValues.length;

      if (oldSize === 0) {
        return;
      }

      const deletedItem = innerValues.pop();

      send({
        type: COLLECTION_EMIT_TYPE_KEY,
        key: oldSize,
        oldSize,
        newSize: innerValues.length,
      });

      return deletedItem;
    },
    replace(...values) {
      const oldSize = innerValues.length;
      innerValues = values;
      send({
        type: COLLECTION_EMIT_TYPE_ALL_CHANGE,
        oldSize,
        newSize: innerValues.length,
      });
    },
    clear() {
      const oldSize = innerValues.length;
      if (oldSize === 0) {
        return;
      }
      innerValues = [];
      send({
        type: COLLECTION_EMIT_TYPE_ALL_CHANGE,
        oldSize,
        newSize: 0,
      });
    },
  };

  return [list, listUpdater];
}

function filterForNegativeKey(key: number) {
  return (change: AtomListEmit) => {
    if (isAtomListSizeEmit(change)) {
      const index = change.newSize + key;
      const oldIndex = change.oldSize + key;
      const isOldIndexOutOfBounds = oldIndex < 0;
      const isIndexOutOfBounds = index < 0;

      // No change when current and old index is out of bounds
      if (isOldIndexOutOfBounds && isIndexOutOfBounds) {
        return false;
      }

      // Handles within bounds size changes
      if (change.newSize !== change.oldSize) {
        return !isOldIndexOutOfBounds || !isIndexOutOfBounds;
      }
    }

    // Handles within bounds size changes when size has not changed
    // meaning old index and index are the same
    switch (change.type) {
      case COLLECTION_EMIT_TYPE_KEY:
        return change.key === change.newSize + key;
      case LIST_EMIT_TYPE_SLICE:
        const index = change.newSize + key;
        return change.start <= index && index <= change.end;
      case COLLECTION_EMIT_TYPE_ALL_CHANGE:
        return true;
      default:
        return false;
    }
  };
}

function filterForPositiveKey(key: number) {
  return (change: AtomListEmit) => {
    if (isAtomListSizeEmit(change)) {
      const isIndexOutOfOldSizeBounds = key >= change.oldSize;
      const isIndexOutOfSizeBounds = key >= change.newSize;

      // No change when index is out of bounds of both old and new size
      if (isIndexOutOfOldSizeBounds && isIndexOutOfSizeBounds) {
        return false;
      }
    }

    switch (change.type) {
      case COLLECTION_EMIT_TYPE_KEY:
        return change.key === key;
      case LIST_EMIT_TYPE_SLICE:
        return change.start <= key && key <= change.end;
      case COLLECTION_EMIT_TYPE_ALL_CHANGE:
        return true;
      default:
        return false;
    }
  };
}
