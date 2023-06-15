import {
  COLLECTION_EMIT_TYPE_CLEAR,
  collectionKeyToValueKey,
  type AtomCollection,
  type AtomCollectionEmitMap,
  type RawAtomCollection,
  COLLECTION_EMIT_TYPE_KEY_WRITE,
  COLLECTION_EMIT_TYPE_KEY_ADD,
  COLLECTION_EMIT_TYPE_KEY_DELETE,
  COLLECTION_EMIT_TYPE_KEY_SWAP,
} from './collection.js';
import { createEmitter, type Emitter } from './emitter.js';
import { filterEmitter } from './filter-emitter.js';
import { atomIteratorKey, type AtomIterator } from './iterable.js';
import { emitterKey, toValueKey, type Atom } from './particle.js';

export const LIST_EMIT_TYPE_APPEND = 'ListAppendEmit';
export const LIST_EMIT_TYPE_RANGE = 'ListRangeEmit';
export const LIST_EMIT_TYPE_REVERSE = 'ListReverseEmit';
export const LIST_EMIT_TYPE_SPLICE = 'ListSpliceEmit';
export const LIST_EMIT_TYPE_SORT = 'ListSortEmit';

interface Range {
  readonly start: number;
  readonly end: number;
}

export interface AtomListEmitRange extends Range {
  readonly type: typeof LIST_EMIT_TYPE_RANGE;
  readonly size: number;
  readonly oldSize: number;
}

export interface AtomListEmitAppend {
  readonly type: typeof LIST_EMIT_TYPE_APPEND;
  readonly size: number;
  readonly oldSize: number;
}

export interface AtomListEmitSplice {
  readonly type: typeof LIST_EMIT_TYPE_SPLICE;
  readonly start: number;
  readonly deleteCount: number;
  readonly addCount: number;
  readonly size: number;
  readonly oldSize: number;
}

export interface AtomListEmitSort {
  readonly type: typeof LIST_EMIT_TYPE_SORT;
  readonly sortMap: number[];
  readonly size: number;
}

export interface AtomListEmitReverse {
  readonly type: typeof LIST_EMIT_TYPE_REVERSE;
  readonly size: number;
}

export interface AtomListEmitMap extends AtomCollectionEmitMap<number> {
  append: AtomListEmitAppend;
  range: AtomListEmitRange;
  reverse: AtomListEmitReverse;
  splice: AtomListEmitSplice;
  sort: AtomListEmitSort;
}

export type AtomListEmit = AtomListEmitMap[keyof AtomListEmitMap];

const atomListBrandKey = Symbol('MetronAtomListBrand');

export function isAtomList(value: unknown): value is AtomList<unknown> {
  return (value as any)?.[atomListBrandKey] === true;
}

export interface AtomList<T>
  extends AtomCollection<T, number, RawAtomList<T>, AtomListEmitMap> {
  readonly [atomListBrandKey]: true;
  at(index: number): Atom<T | undefined>;
  map<U>(callback: (value: T, index: number) => U): AtomList<U>;
  /* TODO: Implement these methods.
  reversed(): DerivedAtomList<T>;
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
  toArraySlice(start?: number, end?: number): T[];
  /* TODO: Implement these methods.
  sliceReversed(start?: number, end?: number): IterableIterator<T>;
  entriesReversed(): IterableIterator<[number, T]>;
  keysReversed(): IterableIterator<number>;
  valuesReversed(): IterableIterator<T>;

  // These should be utility functions that operate on Iterators, but also useful if directly on list
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
  swap(indexA: number, indexB: number): void;
  push(value: T): void;
  append(values: T[]): void;
  insert(index: number, item: T): void;
  delete(index: number): void;
  splice(start: number, deleteCount: number, items?: T[]): T[];
  pop(): T | undefined;
  reverse(): void;
  sort(compare: (a: T, b: T) => number): void;
  /* TODO:
  batch({ set, swap }): void; ? Is there really a use case for this? If so maybe implement a generic batch that can delay any emitters
  replace(...values: T[], options: { keyed?: boolean, key?: keyof T }): void;
   */
  replace(values: T[]): void;
  clear(): void;
}

const SET_INDEX_OUT_OF_BOUNDS_MESSAGE =
  'Index out of bounds, must be an integer above 0 and below size';

export function createAtomList<T>(
  values?: T[]
): [list: AtomList<T>, listUpdater: AtomListWriter<T>] {
  const innerValues = values ? [...values] : [];

  const rawList = createRawAtomList(innerValues);

  const [listEmitter, sendListEmit] = createEmitter<AtomListEmit>();

  const sizeAtom: Atom<number> = {
    [toValueKey]() {
      return rawList.size;
    },
    [emitterKey]: filterEmitter(
      listEmitter,
      (change) =>
        change.type === COLLECTION_EMIT_TYPE_CLEAR &&
        change.size !== change.oldSize
    ),
  };

  const list = createAtomListInternal(rawList, sizeAtom, listEmitter);

  const listWriter: AtomListWriter<T> = createAtomListWriterInternal(
    innerValues,
    sendListEmit
  );

  return [list, listWriter];
}

function createAtomListWriterInternal<T>(
  innerValues: T[],
  sendEmit: (message: AtomListEmit) => void
): AtomListWriter<T> {
  return {
    set(index, value) {
      const oldSize = innerValues.length;
      let normalizedIndex = Math.trunc(index);
      normalizedIndex =
        normalizedIndex < 0 ? oldSize + normalizedIndex : normalizedIndex;
      if (normalizedIndex < 0 || normalizedIndex >= oldSize) {
        throw new Error(SET_INDEX_OUT_OF_BOUNDS_MESSAGE);
      }

      if (value !== innerValues[index]) {
        innerValues[index] = value;

        sendEmit({
          type: COLLECTION_EMIT_TYPE_KEY_WRITE,
          key: index,
          size: innerValues.length,
        });
      }
      return value;
    },
    swap(indexA, indexB) {
      const oldSize = innerValues.length;
      const normalizedIndexA = normalizeIndexStrict(indexA, oldSize);
      const normalizedIndexB = normalizeIndexStrict(indexB, oldSize);

      if (normalizedIndexA === normalizedIndexB) {
        return;
      }

      const temp = innerValues[normalizedIndexA];
      innerValues[normalizedIndexA] = innerValues[normalizedIndexB]!;
      innerValues[normalizedIndexB] = temp!;

      sendEmit({
        type: COLLECTION_EMIT_TYPE_KEY_SWAP,
        keySwap: [normalizedIndexA, normalizedIndexB],
        size: innerValues.length,
      });
    },
    push(value) {
      innerValues.push(value);
      const oldSize = innerValues.length - 1;
      sendEmit({
        type: COLLECTION_EMIT_TYPE_KEY_ADD,
        key: oldSize,
        oldSize,
        size: innerValues.length,
      });
    },
    append(values) {
      const appendCount = values.length;
      if (appendCount === 0) {
        return;
      } else if (appendCount === 1) {
        return this.push(values[0]!);
      }

      const oldSize = innerValues.length;

      innerValues.push(...values);

      const size = innerValues.length;

      sendEmit({
        type: LIST_EMIT_TYPE_APPEND,
        oldSize,
        size,
      });
    },
    insert(index, item) {
      const oldSize = innerValues.length;
      if (index === oldSize) {
        return this.push(item);
      }

      innerValues.splice(index, 0, item);

      const newSize = innerValues.length;

      sendEmit({
        type: COLLECTION_EMIT_TYPE_KEY_ADD,
        key: index,
        oldSize,
        size: newSize,
      });
    },
    delete(index) {
      const oldSize = innerValues.length;
      const normalizedIndex = normalizeIndex(index, oldSize);
      if (normalizedIndex === undefined) {
        return false;
      }
      if (index === oldSize - 1) {
        innerValues.pop()!;
      } else {
        innerValues.splice(normalizedIndex, 1) as [T];
      }
      const size = innerValues.length;

      sendEmit({
        type: COLLECTION_EMIT_TYPE_KEY_DELETE,
        key: index,
        oldSize,
        size,
      });

      return true;
    },
    splice(start, deleteCount, [...values] = []) {
      const oldSize = innerValues.length;
      const deletedItems = innerValues.splice(start, deleteCount, ...values);
      const size = innerValues.length;
      const addCount = values.length;
      sendEmit({
        type: LIST_EMIT_TYPE_SPLICE,
        start: start,
        deleteCount: Math.trunc(size - oldSize - addCount),
        addCount,
        oldSize,
        size,
      });
      return deletedItems;
    },
    pop() {
      const oldSize = innerValues.length;

      if (oldSize === 0) {
        return;
      }

      const deletedItem = innerValues.pop();

      sendEmit({
        type: COLLECTION_EMIT_TYPE_KEY_DELETE,
        key: oldSize,
        oldSize,
        size: innerValues.length,
      });

      return deletedItem;
    },
    replace(values) {
      if (values.length === 0) {
        return this.clear();
      }
      const oldSize = innerValues.length;
      const size = values.length;
      innerValues.splice(0, oldSize, ...values);
      sendEmit({
        type: LIST_EMIT_TYPE_RANGE,
        start: 0,
        end: Math.max(size, oldSize) - 1,
        oldSize,
        size,
      });
    },
    reverse() {
      const size = innerValues.length;
      if (size === 0) {
        return;
      }
      innerValues.reverse();
      sendEmit({
        type: LIST_EMIT_TYPE_REVERSE,
        size,
      });
    },
    sort(compare) {
      const size = innerValues.length;
      if (size === 0) {
        return;
      }

      const tmpSorted = innerValues
        .map((value, index) => [value, index] as const)
        .sort((a, b) => compare(a[0], b[0]));

      innerValues.length = 0;
      const sortMap: number[] = [];

      let isOrderUnchanged = true;
      for (const [value, index] of tmpSorted) {
        innerValues.push(value);
        if (isOrderUnchanged && index !== sortMap.length) {
          isOrderUnchanged = false;
        }
        sortMap.push(index);
      }

      if (isOrderUnchanged) {
        return;
      }

      sendEmit({
        type: LIST_EMIT_TYPE_SORT,
        sortMap,
        size,
      });
    },
    clear() {
      const oldSize = innerValues.length;
      if (oldSize === 0) {
        return;
      }
      innerValues.length = 0;
      sendEmit({
        type: COLLECTION_EMIT_TYPE_CLEAR,
        oldSize,
        size: 0,
      });
    },
  };
}

function createRawAtomList<T>(innerValues: T[]): RawAtomList<T> {
  function rawAt(index: number) {
    const size = innerValues.length;
    let normalizedIndex = Math.trunc(index);
    normalizedIndex =
      normalizedIndex < 0 ? size + normalizedIndex : normalizedIndex;
    return innerValues[index];
  }

  return {
    get size() {
      return innerValues.length;
    },
    at: rawAt,
    [collectionKeyToValueKey]: rawAt,
    toArraySlice(start, end) {
      return innerValues.slice(start, end);
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
}

function createMappedRawAtomList<T, U>(
  rawList: RawAtomList<T>,
  mapper: (value: T, index: number) => U
): RawAtomList<U> {
  function rawAt(index: number) {
    const size = rawList.size;
    let normalizedIndex = Math.trunc(index);
    normalizedIndex =
      normalizedIndex < 0 ? size + normalizedIndex : normalizedIndex;

    if (normalizedIndex >= size) {
      return;
    }

    return mapper(rawList.at(normalizedIndex)!, normalizedIndex);
  }

  function* values() {
    for (const [index, value] of rawList.entries()) {
      yield mapper(value, index);
    }
  }

  return {
    get size() {
      return rawList.size;
    },
    at: rawAt,
    [collectionKeyToValueKey]: rawAt,
    toArray() {
      return rawList.toArray().map(mapper);
    },
    toArraySlice(start, end) {
      return rawList.toArraySlice(start, end).map(mapper);
    },
    [Symbol.iterator]: values,
    *entries() {
      for (const [index, value] of rawList.entries()) {
        yield [index, mapper(value, index)];
      }
    },
    keys() {
      return rawList.keys();
    },
    values,
  };
}

function createAtomKeyGetter<T>(
  listEmitter: Emitter<AtomListEmit>,
  keyToValue: (key: number) => T | undefined
): (key: number) => Atom<T | undefined> {
  const weakAtoms: { [key: number]: WeakRef<Atom<T | undefined>> } = {};
  const keyEmitSenders: { [key: number]: () => void } = {};
  let weakAtomCount = 0;
  let listEmitTerminator: undefined | (() => void);

  const finalizationRegistry = new FinalizationRegistry((index: number) => {
    delete keyEmitSenders[index];
    delete weakAtoms[index];
    weakAtomCount--;

    if (weakAtomCount < 1) {
      listEmitTerminator?.();
      listEmitTerminator = undefined;
    }
  });

  const emitHandler = (message: AtomListEmit) => {
    if (weakAtomCount === 0) {
      return;
    }
    switch (message.type) {
      case COLLECTION_EMIT_TYPE_CLEAR: {
        checkBounds(message.oldSize, keyEmitSenders);
        return;
      }
      case LIST_EMIT_TYPE_REVERSE: {
        checkBounds(message.size, keyEmitSenders);
        return;
      }
      case LIST_EMIT_TYPE_SORT: {
        const { size, sortMap } = message;
        if (size === 0) {
          return;
        }

        for (const [key, keySend] of Object.entries(keyEmitSenders)) {
          let index = Number(key);
          index = index >= 0 ? index : index + size;
          if (index === sortMap[index]) {
            continue;
          }
          const isIndexInSizeBounds = index < size;
          if (isIndexInSizeBounds) {
            keySend();
          }
        }
        return;
      }
      case COLLECTION_EMIT_TYPE_KEY_WRITE:
      case COLLECTION_EMIT_TYPE_KEY_ADD:
      case COLLECTION_EMIT_TYPE_KEY_DELETE: {
        const { key } = message;
        keyEmitSenders[key]?.();
        keyEmitSenders[key - message.size]?.();
        return;
      }
      case LIST_EMIT_TYPE_RANGE: {
        const { start, end, size } = message;
        for (let i = start; i <= end; i++) {
          keyEmitSenders[i]?.();
          keyEmitSenders[i - size]?.();
        }
        return;
      }
      case COLLECTION_EMIT_TYPE_KEY_SWAP: {
        const { keySwap, size } = message;
        const [keyA, keyB] = keySwap;
        keyEmitSenders[keyA]?.();
        keyEmitSenders[keyA - size]?.();
        keyEmitSenders[keyB]?.();
        keyEmitSenders[keyB - size]?.();
        return;
      }
      default: {
        throw new Error('Unhandled emit', { cause: message });
      }
    }
  };

  return function getKeyedParticle(key: number) {
    const weakAtom = weakAtoms[key];
    let atom: Atom<T | undefined> | undefined = weakAtom?.deref();

    if (!atom) {
      const [keyEmitter, sendForKey] = createEmitter();
      keyEmitSenders[key] = sendForKey;
      atom = {
        [toValueKey]() {
          return keyToValue(key);
        },
        [emitterKey]: keyEmitter,
      };
      const freshWeakAtom = new WeakRef(atom);

      finalizationRegistry.register(atom, key);

      if (listEmitTerminator === undefined) {
        listEmitTerminator = listEmitter(emitHandler);
      }

      weakAtoms[key] = freshWeakAtom;
      weakAtomCount++;
    }

    return atom;
  };
}

function normalizeIndexStrict(index: number, size: number): number {
  let normalizedIndex = Math.trunc(index);
  normalizedIndex =
    normalizedIndex < 0 ? size + normalizedIndex : normalizedIndex;
  if (normalizedIndex < 0 || normalizedIndex >= size) {
    throw new Error(SET_INDEX_OUT_OF_BOUNDS_MESSAGE);
  }
  return normalizedIndex;
}

function normalizeIndex(index: number, size: number): number | undefined {
  let normalizedIndex = Math.trunc(index);
  normalizedIndex =
    normalizedIndex < 0 ? size + normalizedIndex : normalizedIndex;
  if (normalizedIndex < 0 || normalizedIndex >= size) {
    return undefined;
  }
  return normalizedIndex;
}

function checkBounds(
  size: number,
  keyEmitSenders: { [key: number]: () => void }
) {
  if (size === 0) {
    return;
  }

  for (const [key, keySend] of Object.entries(keyEmitSenders)) {
    let index = Number(key);
    index = index >= 0 ? index : index + size;
    const isIndexInSizeBounds = index < size;
    if (isIndexInSizeBounds) {
      keySend();
    }
  }
}

function createAtomListInternal<T>(
  rawList: RawAtomList<T>,
  sizeAtom: Atom<number>,
  listEmitter: Emitter<AtomListEmit>
) {
  const getKeyedParticle = createAtomKeyGetter(listEmitter, rawList.at);

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
    [collectionKeyToValueKey]: at,
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
    map(callback) {
      return createMappedAtomList(list, callback);
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

  return list;
}

function createMappedAtomList<T, U>(
  originList: AtomList<T>,
  mapper: (value: T, index: number) => U
): AtomList<U> {
  const originRawList = originList[toValueKey]();

  const rawList = createMappedRawAtomList(originRawList, mapper);

  return createAtomListInternal(
    rawList,
    originList.size,
    originList[emitterKey]
  );
}
