import {
  ValueParticle,
  createSensor,
  emitterKey,
  valueOfKey,
} from '@metron/core';
import { filterEmitter } from './filter-emitter.js';

export enum AtomListChangeType {
  Index,
  Range,
  All,
}

// TODO: Add more data to change events, so as to not require use of rawList
// or innerValues when filtering emitter for key changes.
// Move shared data into base interface.
// Put inside a namespace?
interface AtomListChangeSingle {
  readonly type: AtomListChangeType.Index;
  readonly index: number;
  readonly oldSize: number;
  readonly sizeChanged: boolean;
}

interface AtomListChangeMany {
  readonly type: AtomListChangeType.Range;
  readonly start: number;
  readonly end: number;
  readonly oldSize: number;
  readonly sizeChanged: boolean;
}

interface AtomListChangeAll {
  readonly type: AtomListChangeType.All;
  readonly oldSize: number;
  readonly sizeChanged: boolean;
}

export type AtomListChange =
  | AtomListChangeSingle
  | AtomListChangeMany
  | AtomListChangeAll;

export interface AtomList<T>
  extends ValueParticle<RawAtomList<T>, AtomListChange> {
  readonly size: ValueParticle<number>;
  readonly untracked: RawAtomList<T>;
  at(index: number): ValueParticle<T | undefined>;
  /* TODO: Implement these methods.
  slice(start?: number, end?: number): AtomIterator<T>;
  sliceReversed(start?: number, end?: number): AtomIterator<T>;
  entriesReversed(): AtomIterator<[number, T]>;
  entries(): AtomIterator<[number, T]>;
  keysReversed(): AtomIterator<number>;
  keys(): AtomIterator<number>;
  valuesReversed(): AtomIterator<T>;
  values(): AtomIterator<T>;
  */
}

export interface RawAtomList<T> {
  readonly size: number;
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
  entries(): IterableIterator<[number, T]>;
  keys(): IterableIterator<number>;
  values(): IterableIterator<T>;
}

export interface AtomListWriter<T> {
  setAt(index: number, value: T): T;
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
    at(index) {
      const size = innerValues.length;
      let normalizedIndex = Math.trunc(index);
      normalizedIndex =
        normalizedIndex < 0 ? size + normalizedIndex : normalizedIndex;
      return innerValues[index];
    },
    toArray() {
      return innerValues.slice();
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

  const { emitter: listEmitter, send } = createSensor<AtomListChange>();

  /* TODO:
  Abstract this finalization logic into a reusable keyed memo function
  (in it's own package) that can be used for creating keyed particles for
  AtomMap and AtomSet.
  Try without memoizing (always fresh particle), and with lifetime management
*/
  const weakParticles = new Map<
    number,
    WeakRef<ValueParticle<T | undefined>>
  >();

  const finalizationRegistry = new FinalizationRegistry((index: number) => {
    weakParticles.delete(index);
  });

  function getKeyedParticle(key: number) {
    const weakParticle = weakParticles.get(key);
    let particle: ValueParticle<T | undefined> | undefined;
    if (weakParticle) {
      particle = weakParticle.deref();
    }

    if (!particle) {
      let emitterFilter =
        key < 0
          ? (change: AtomListChange) => {
              const oldIndex = change.oldSize + key;
              const index = innerValues.length + key;
              const isOldIndexOutOfBounds = oldIndex < 0;
              const isIndexOutOfBounds = index < 0;

              // No change when current and old index is out of bounds
              if (isOldIndexOutOfBounds && isIndexOutOfBounds) {
                return false;
              }

              // Handles within bounds size changes when size has changed
              if (change.sizeChanged) {
                return !isOldIndexOutOfBounds || !isIndexOutOfBounds;
              }

              // Handles within bounds size changes when size has not changed
              // meaning old index and index are the same
              switch (change.type) {
                case AtomListChangeType.Index:
                  return change.index === index;
                case AtomListChangeType.Range:
                  return change.start <= index && index <= change.end;
                case AtomListChangeType.All:
                  return true;
                default:
                  return false;
              }
            }
          : (change: AtomListChange) => {
              const isIndexOutOfOldSizeBounds = key >= change.oldSize;
              const isIndexOutOfSizeBounds = key >= innerValues.length;

              // No change when index is out of bounds of both old and new size
              if (isIndexOutOfOldSizeBounds && isIndexOutOfSizeBounds) {
                return false;
              }

              switch (change.type) {
                case AtomListChangeType.Index:
                  return change.index === key;
                case AtomListChangeType.Range:
                  return change.start <= key && key <= change.end;
                case AtomListChangeType.All:
                  return true;
                default:
                  return false;
              }
            };
      particle = {
        [valueOfKey]() {
          return rawList.at(key);
        },
        [emitterKey]: filterEmitter(listEmitter, emitterFilter),
      };
      const freshWeakParticle = new WeakRef(particle);

      finalizationRegistry.register(particle, key);

      weakParticles.set(key, freshWeakParticle);
    }

    return particle;
  }

  const sizeParticle: ValueParticle<number> = {
    [valueOfKey]() {
      return rawList.size;
    },
    [emitterKey]: filterEmitter(listEmitter, (change) => change.sizeChanged),
  };

  const list: AtomList<T> = {
    get size() {
      return sizeParticle;
    },
    get untracked() {
      return rawList;
    },
    at(index) {
      return getKeyedParticle(Math.trunc(index));
    },
    [valueOfKey]() {
      return rawList;
    },
    [emitterKey]: listEmitter,
  };

  const listUpdater: AtomListWriter<T> = {
    setAt(index, value) {
      const oldSize = innerValues.length;
      let normalizedIndex = Math.trunc(index);
      normalizedIndex =
        normalizedIndex < 0 ? oldSize + normalizedIndex : normalizedIndex;
      if (normalizedIndex < 0 || normalizedIndex > oldSize) {
        throw new Error(SET_INDEX_OUT_OF_BOUNDS_MESSAGE);
      }

      if (value !== innerValues[index]) {
        innerValues[index] = value;

        const nowSize = innerValues.length;

        send({
          type: AtomListChangeType.Index,
          index: index,
          oldSize,
          sizeChanged: oldSize !== nowSize,
        });
      }
      return value;
    },
    push(value) {
      innerValues.push(value);
      const index = innerValues.length - 1;
      send({
        type: AtomListChangeType.Index,
        index,
        oldSize: index,
        sizeChanged: true,
      });
    },
    append(...values) {
      const start = innerValues.length;
      innerValues.push(...values);
      send({
        type: AtomListChangeType.Range,
        start,
        end: innerValues.length - 1,
        oldSize: start,
        sizeChanged: true,
      });
    },
    insert(index, item) {
      const oldSize = innerValues.length;
      if (index === oldSize) {
        return this.push(item);
      }

      innerValues.splice(index, 0, item);

      send({
        type: AtomListChangeType.Range,
        start: index,
        end: innerValues.length - 1,
        oldSize,
        sizeChanged: true,
      });
    },
    splice(start, deleteCount, items = []) {
      const oldSize = innerValues.length;
      const deletedItems = innerValues.splice(start, deleteCount, ...items);
      const nowSize = innerValues.length;
      send({
        type: AtomListChangeType.Range,
        start,
        end: nowSize - 1,
        oldSize,
        sizeChanged: oldSize !== nowSize,
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
        type: AtomListChangeType.Index,
        index: oldSize,
        oldSize,
        sizeChanged: true,
      });

      return deletedItem;
    },
    replace(...values) {
      const oldSize = innerValues.length;
      innerValues = values;
      send({
        type: AtomListChangeType.All,
        oldSize,
        sizeChanged: oldSize !== innerValues.length,
      });
    },
    clear() {
      const oldSize = innerValues.length;
      if (oldSize === 0) {
        return;
      }
      innerValues = [];
      send({
        type: AtomListChangeType.All,
        oldSize,
        sizeChanged: true,
      });
    },
  };

  return [list, listUpdater];
}
