import { type Atom, createSensor, emitterKey, toValueKey } from '@metron/core';
import { filterEmitter } from './filter-emitter.js';
import { atomIteratorKey, type AtomIterator } from './iterable.js';
import {
  COLLECTION_EMIT_TYPE_ALL_CHANGE,
  type AtomCollection,
  type AtomCollectionEmitChange,
  COLLECTION_EMIT_TYPE_SLICE_CHANGE,
  COLLECTION_EMIT_TYPE_KEY_CHANGE,
  type RawAtomCollection,
  collectionBrandKey,
} from './collection.js';

export interface AtomList<T> extends AtomCollection<T, number, RawAtomList<T>> {
  /* TODO: Implement these methods.
  slice(start?: number, end?: number): DerivedAtomList<T>;
  sliceReversed(start?: number, end?: number): DerivedAtomList<T>;
  entriesReversed(): AtomIterator<[number, T]>;
  keysReversed(): AtomIterator<number>;
  valuesReversed(): AtomIterator<T>;
  */
}

export interface RawAtomList<T> extends RawAtomCollection<T, number> {
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

  const rawList: RawAtomList<T> = {
    get size() {
      return innerValues.length;
    },
    get(index) {
      const size = innerValues.length;
      let normalizedIndex = Math.trunc(index);
      normalizedIndex =
        normalizedIndex < 0 ? size + normalizedIndex : normalizedIndex;
      return innerValues[index];
    },
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

  const { emitter: listEmitter, send } =
    createSensor<AtomCollectionEmitChange<number>>();

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
      let emitterFilter =
        key < 0
          ? (change: AtomCollectionEmitChange<number>) => {
              const oldIndex = change.oldSize + key;
              const index = innerValues.length + key;
              const isOldIndexOutOfBounds = oldIndex < 0;
              const isIndexOutOfBounds = index < 0;

              // No change when current and old index is out of bounds
              if (isOldIndexOutOfBounds && isIndexOutOfBounds) {
                return false;
              }

              // Handles within bounds size changes when size has changed
              if (change.newSize !== change.oldSize) {
                return !isOldIndexOutOfBounds || !isIndexOutOfBounds;
              }

              // Handles within bounds size changes when size has not changed
              // meaning old index and index are the same
              switch (change.type) {
                case COLLECTION_EMIT_TYPE_KEY_CHANGE:
                  return change.key === index;
                case COLLECTION_EMIT_TYPE_SLICE_CHANGE:
                  return change.keyStart <= index && index <= change.keyEnd;
                case COLLECTION_EMIT_TYPE_ALL_CHANGE:
                  return true;
                default:
                  return false;
              }
            }
          : (change: AtomCollectionEmitChange<number>) => {
              const isIndexOutOfOldSizeBounds = key >= change.oldSize;
              const isIndexOutOfSizeBounds = key >= innerValues.length;

              // No change when index is out of bounds of both old and new size
              if (isIndexOutOfOldSizeBounds && isIndexOutOfSizeBounds) {
                return false;
              }

              switch (change.type) {
                case COLLECTION_EMIT_TYPE_KEY_CHANGE:
                  return change.key === key;
                case COLLECTION_EMIT_TYPE_SLICE_CHANGE:
                  return change.keyStart <= key && key <= change.keyEnd;
                case COLLECTION_EMIT_TYPE_ALL_CHANGE:
                  return true;
                default:
                  return false;
              }
            };
      atom = {
        [toValueKey]() {
          return rawList.get(key);
        },
        [emitterKey]: filterEmitter(listEmitter, emitterFilter),
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
      (change) => change.newSize !== change.oldSize
    ),
  };

  const iteratorAtom: AtomIterator<T, AtomCollectionEmitChange<number>> = {
    [toValueKey]() {
      return rawList.values();
    },
    [emitterKey]: listEmitter,
  };

  const entriesIteratorAtom: AtomIterator<
    [number, T],
    AtomCollectionEmitChange<number>
  > = {
    [toValueKey]() {
      return rawList.entries();
    },
    [emitterKey]: listEmitter,
  };

  const keysIteratorAtom: AtomIterator<
    number,
    AtomCollectionEmitChange<number>
  > = {
    [toValueKey]() {
      return rawList.keys();
    },
    [emitterKey]: listEmitter,
  };

  const list: AtomList<T> = {
    [collectionBrandKey]: true,
    get size() {
      return sizeAtom;
    },
    get(index) {
      return getKeyedParticle(Math.trunc(index));
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
          type: COLLECTION_EMIT_TYPE_KEY_CHANGE,
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
        type: COLLECTION_EMIT_TYPE_KEY_CHANGE,
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
        type: COLLECTION_EMIT_TYPE_SLICE_CHANGE,
        keyStart: oldSize,
        keyEnd: newSize - 1,
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
        type: COLLECTION_EMIT_TYPE_SLICE_CHANGE,
        keyStart: index,
        keyEnd: newSize - 1,
        oldSize,
        newSize,
      });
    },
    splice(start, deleteCount, items = []) {
      const oldSize = innerValues.length;
      const deletedItems = innerValues.splice(start, deleteCount, ...items);
      const newSize = innerValues.length;
      send({
        type: COLLECTION_EMIT_TYPE_SLICE_CHANGE,
        keyStart: start,
        keyEnd: newSize - 1,
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
        type: COLLECTION_EMIT_TYPE_KEY_CHANGE,
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
