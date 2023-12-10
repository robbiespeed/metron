// import { emptyCacheToken, type EmptyCacheToken } from './cache.js';
// import { cleanupRegistry } from './cleanup-registry.js';
import {
  COLLECTION_MESSAGE_TYPE_CLEAR,
  type AtomCollection,
  type AtomCollectionMessageMap,
  type UnwrappedAtomCollection,
  COLLECTION_MESSAGE_TYPE_KEY_WRITE,
  COLLECTION_MESSAGE_TYPE_KEY_ADD,
  COLLECTION_MESSAGE_TYPE_KEY_DELETE,
  COLLECTION_MESSAGE_TYPE_KEY_SWAP,
  CollectionSizeAtom,
  type AtomCollectionMessageClear,
  type AtomCollectionMessageKeyAdd,
  type AtomCollectionMessageKeyDelete,
  type AtomCollectionMessageKeyWrite,
  type AtomCollectionMessageKeySwap,
} from './collections/shared.js';
import {
  Emitter,
  type EmitMessage,
  type SubscriptionHandler,
} from './emitter.js';
import { signalKey, toValueKey, type Atom } from './particle.js';
import { SignalNode, type Disposer } from './signal-node.js';

export const LIST_MESSAGE_TYPE_APPEND = 'ListAppend';
export const LIST_MESSAGE_TYPE_REVERSE = 'ListReverse';
export const LIST_MESSAGE_TYPE_SPLICE = 'ListSplice';
export const LIST_MESSAGE_TYPE_SORT = 'ListSort';

export type AtomListEmitAppend = EmitMessage<
  typeof LIST_MESSAGE_TYPE_APPEND,
  {
    readonly size: number;
    readonly oldSize: number;
  }
>;

export type AtomListEmitReverse = EmitMessage<
  typeof LIST_MESSAGE_TYPE_REVERSE,
  number
>;

export type AtomListEmitSplice = EmitMessage<
  typeof LIST_MESSAGE_TYPE_SPLICE,
  {
    readonly start: number;
    readonly deleteCount: number;
    readonly addCount: number;
    readonly size: number;
    readonly oldSize: number;
  }
>;

export type AtomListEmitSort = EmitMessage<
  typeof LIST_MESSAGE_TYPE_SORT,
  {
    readonly sortMap: number[];
    readonly size: number;
  }
>;

export interface AtomListEmitMap extends AtomCollectionMessageMap<number> {
  append: AtomListEmitAppend;
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
  extends AtomCollection<T, number, RawAtomList<T>, AtomListEmit> {
  readonly [atomListBrandKey]: true;
  at(index: number): Atom<T | undefined>;
  map<U>(mapper: (value: T) => U): AtomList<U>;
  subscribe(handler: SubscriptionHandler<AtomListEmit>): Disposer;
  /* TODO: Implement these methods.
  sorted(): AtomList<T>;
  reversed(): AtomList<T>;
  slice(start?: number, end?: number): AtomList<T>;
  sliceReversed(start?: number, end?: number): AtomList<T>;
  */
  /* What would a AtomIterator do?
  entriesReversed(): AtomIterator<[number, T]>;
  keysReversed(): AtomIterator<number>;
  valuesReversed(): AtomIterator<T>;
  */
}

export interface RawAtomList<T> extends UnwrappedAtomCollection<T, number> {
  at(index: number): T | undefined;
  toArray(): T[];
  toArraySlice(start?: number, end?: number): T[];
  forEach(callback: (value: T, index: number) => void): void;
  forEachInRange(
    callback: (value: T, index: number) => void,
    start: number,
    end?: number
  ): void;
  /* TODO: Implement these methods.
  valuesRange(start?: number, end?: number): IterableIterator<T>;
  valuesRangeReversed(start?: number, end?: number): IterableIterator<T>;
  entriesReversed(): IterableIterator<[number, T]>;
  keysReversed(): IterableIterator<number>;
  valuesReversed(): IterableIterator<T>;
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

const INDEX_OUT_OF_BOUNDS_MESSAGE = 'Index out of bounds';

export function createAtomList<T>(
  values?: T[]
): [list: AtomList<T>, listUpdater: AtomListWriter<T>] {
  const innerValues = values ? [...values] : [];

  let signalNode: SignalNode | undefined;
  function getSignalNode() {
    if (signalNode === undefined) {
      signalNode = new SignalNode(undefined) as SignalNode;
      signalNode.initAsSource();
    }
    return signalNode;
  }

  function updateSignalNode() {
    signalNode?.update();
  }

  const listEmitter = new Emitter<AtomListEmit>();

  const rawList = createRawAtomList(innerValues);

  const list = createAtomListInternal(
    innerValues,
    rawList,
    getSignalNode,
    listEmitter
  );

  const listWriter: AtomListWriter<T> = createAtomListWriterInternal(
    innerValues,
    updateSignalNode,
    listEmitter
  );

  return [list, listWriter];
}

function createAtomListWriterInternal<T>(
  innerValues: T[],
  updateSignalNode: () => void,
  listEmitter: Emitter<AtomListEmit>
): AtomListWriter<T> {
  return {
    set(index, value) {
      const oldSize = innerValues.length;
      let normalizedIndex = Math.trunc(index);
      normalizedIndex =
        normalizedIndex < 0 ? oldSize + normalizedIndex : normalizedIndex;
      if (normalizedIndex < 0 || normalizedIndex >= oldSize) {
        throw new Error(INDEX_OUT_OF_BOUNDS_MESSAGE);
      }

      if (value !== innerValues[index]) {
        innerValues[index] = value;

        updateSignalNode();
        listEmitter.send({
          type: COLLECTION_MESSAGE_TYPE_KEY_WRITE,
          data: {
            key: index,
            size: innerValues.length,
          },
        });
      }
      return value;
    },
    swap(indexA, indexB) {
      const oldSize = innerValues.length;
      // let normalizedIndexA = normalizeIndexStrict(indexA, oldSize);
      // let normalizedIndexB = normalizeIndexStrict(indexB, oldSize);
      if (
        indexA >> 0 !== indexA ||
        indexA < 0 ||
        indexA >= oldSize ||
        indexB >> 0 !== indexB ||
        indexB < 0 ||
        indexB >= oldSize
      ) {
        throw new Error(INDEX_OUT_OF_BOUNDS_MESSAGE);
      }

      if (indexA === indexB) {
        return;
      }

      if (indexA > indexB) {
        // Normalize so that a < b
        return this.swap(indexB, indexA);
      }

      const temp = innerValues[indexA];
      innerValues[indexA] = innerValues[indexB]!;
      innerValues[indexB] = temp!;

      updateSignalNode();
      listEmitter.send({
        type: COLLECTION_MESSAGE_TYPE_KEY_SWAP,
        data: {
          keySwap: [indexA, indexB],
          size: innerValues.length,
        },
      });
    },
    push(value) {
      innerValues.push(value);
      const oldSize = innerValues.length - 1;

      updateSignalNode();
      listEmitter.send({
        type: COLLECTION_MESSAGE_TYPE_KEY_ADD,
        data: {
          key: oldSize,
          oldSize,
          size: innerValues.length,
        },
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

      updateSignalNode();
      listEmitter.send({
        type: LIST_MESSAGE_TYPE_APPEND,
        data: {
          oldSize,
          size,
        },
      });
    },
    insert(index, item) {
      const oldSize = innerValues.length;
      if (index === oldSize) {
        return this.push(item);
      }

      if (index >> 0 !== index || index < 0 || index > oldSize) {
        throw new Error(INDEX_OUT_OF_BOUNDS_MESSAGE);
      }

      innerValues.splice(index, 0, item);

      const newSize = innerValues.length;

      updateSignalNode();
      listEmitter.send({
        type: COLLECTION_MESSAGE_TYPE_KEY_ADD,
        data: {
          key: index,
          oldSize,
          size: newSize,
        },
      });
    },
    delete(index) {
      const oldSize = innerValues.length;

      if (index >> 0 !== index || index < 0 || index >= oldSize) {
        throw new Error(INDEX_OUT_OF_BOUNDS_MESSAGE);
      }

      if (index === oldSize - 1) {
        innerValues.pop()!;
      } else {
        innerValues.splice(index, 1) as [T];
      }
      const size = innerValues.length;

      updateSignalNode();
      listEmitter.send({
        type: COLLECTION_MESSAGE_TYPE_KEY_DELETE,
        data: {
          key: index,
          oldSize,
          size,
        },
      });

      return true;
    },
    splice(start, deleteCount, [...values] = []) {
      const oldSize = innerValues.length;
      const deletedItems = innerValues.splice(start, deleteCount, ...values);
      const size = innerValues.length;
      const addCount = values.length;
      updateSignalNode();
      listEmitter.send({
        type: LIST_MESSAGE_TYPE_SPLICE,
        data: {
          start,
          deleteCount: deletedItems.length,
          addCount,
          oldSize,
          size,
        },
      });
      return deletedItems;
    },
    pop() {
      const oldSize = innerValues.length;

      if (oldSize === 0) {
        return;
      }

      const deletedItem = innerValues.pop();
      const size = innerValues.length;

      updateSignalNode();
      listEmitter.send({
        type: COLLECTION_MESSAGE_TYPE_KEY_DELETE,
        data: {
          key: size,
          oldSize,
          size,
        },
      });

      return deletedItem;
    },
    replace(values) {
      const oldSize = innerValues.length;
      if (oldSize === 0) {
        return this.append(values);
      }
      const size = values.length;
      innerValues.splice(0, oldSize, ...values);
      updateSignalNode();
      listEmitter.send({
        type: LIST_MESSAGE_TYPE_SPLICE,
        data: {
          start: 0,
          deleteCount: oldSize,
          addCount: size,
          oldSize,
          size,
        },
      });
    },
    reverse() {
      const size = innerValues.length;
      if (size === 0) {
        return;
      }
      innerValues.reverse();
      updateSignalNode();
      listEmitter.send({
        type: LIST_MESSAGE_TYPE_REVERSE,
        data: size,
      });
    },
    sort(compare) {
      const size = innerValues.length;
      if (size === 0) {
        return;
      }

      const sortMap = [...innerValues.keys()].sort((a, b) =>
        compare(innerValues[a]!, innerValues[b]!)
      );

      const midPoint = size >> 1;

      let isOrderUnchanged = true;
      for (let i = 0; i < size; i++) {
        const oldIndex = sortMap[i]!;
        if (oldIndex !== i && oldIndex <= midPoint) {
          isOrderUnchanged = false;
          const temp = innerValues[oldIndex]!;
          innerValues[oldIndex] = innerValues[i]!;
          innerValues[i] = temp;
        }
      }

      if (isOrderUnchanged) {
        return;
      }

      updateSignalNode();
      listEmitter.send({
        type: LIST_MESSAGE_TYPE_SORT,
        data: {
          sortMap,
          size,
        },
      });
    },
    clear() {
      const oldSize = innerValues.length;
      if (oldSize === 0) {
        return;
      }
      innerValues.length = 0;
      updateSignalNode();
      listEmitter.send({
        type: COLLECTION_MESSAGE_TYPE_CLEAR,
        data: {
          size: 0,
          oldSize,
        },
      });
    },
  };
}

function createRawAtomList<T>(innerValues: T[]): RawAtomList<T> {
  return {
    get size() {
      return innerValues.length;
    },
    at(index) {
      return innerValues.at(index);
    },
    get(index) {
      return innerValues[index];
    },
    forEach(callback) {
      const size = innerValues.length;
      for (let i = 0; i < size; i++) {
        callback(innerValues[i]!, i);
      }
    },
    forEachInRange(callback, start, end) {
      const size = innerValues.length;
      if (start >> 0 !== start || start < 0 || start >= size) {
        throw new Error(INDEX_OUT_OF_BOUNDS_MESSAGE);
      }
      if (end === undefined) {
        end = size;
      } else if (end > size) {
        throw new Error(INDEX_OUT_OF_BOUNDS_MESSAGE);
      }

      for (let i = start; i < end; i++) {
        callback(innerValues[i]!, i);
      }
    },
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

function createAtomKeyGetter<T>(
  listEmitter: Emitter<AtomListEmit>
): (
  key: number,
  getValue: (key: number) => T | undefined
) => Atom<T | undefined> {
  const weakKeyNodes: { [key: number]: WeakRef<SignalNode> } = {};
  let signalNodeCount = 0;
  let listEmitTerminator: undefined | (() => void);

  const finalizationRegistry = new FinalizationRegistry((index: number) => {
    delete weakKeyNodes[index];
    signalNodeCount--;

    if (signalNodeCount < 1) {
      listEmitTerminator?.();
      listEmitTerminator = undefined;
    }
  });

  function sendKeyEmit(key: number, size: number) {
    weakKeyNodes[key]?.deref()?.update();
    weakKeyNodes[key - size]?.deref()?.update();
  }

  function sendKeyEmitRange(start: number, end: number, size: number) {
    for (let i = start; i <= end; i++) {
      weakKeyNodes[i]?.deref()?.update();
      weakKeyNodes[i - size]?.deref()?.update();
    }
  }

  function sendEmitInBounds(size: number) {
    for (const [key, node] of Object.entries(weakKeyNodes)) {
      let index = Number(key);
      index = index >= 0 ? index : index + size;
      const isIndexInSizeBounds = index < size;
      if (isIndexInSizeBounds) {
        node?.deref()?.update();
      }
    }
  }

  function handleClear({ oldSize }: AtomCollectionMessageClear['data']) {
    sendEmitInBounds(oldSize);
  }

  function handleKeyAdd({
    key,
    size,
    oldSize,
  }: AtomCollectionMessageKeyAdd<number>['data']) {
    if (key === oldSize) {
      sendKeyEmit(key, size);
    } else {
      sendKeyEmitRange(key, Math.max(size, oldSize), size);
    }
  }

  function handleKeyDelete({
    key,
    size,
    oldSize,
  }: AtomCollectionMessageKeyDelete<number>['data']) {
    if (key === oldSize - 1) {
      sendKeyEmit(key, size);
    } else {
      sendKeyEmitRange(key, Math.max(size, oldSize), size);
    }
  }

  function handleKeyWrite({
    key,
    size,
  }: AtomCollectionMessageKeyWrite<number>['data']) {
    sendKeyEmit(key, size);
  }

  function handleKeySwap({
    keySwap,
    size,
  }: AtomCollectionMessageKeySwap<number>['data']) {
    const [keyA, keyB] = keySwap;
    sendKeyEmit(keyA, size);
    sendKeyEmit(keyB, size);
  }

  function handleAppend({ oldSize, size }: AtomListEmitAppend['data']) {
    sendKeyEmitRange(oldSize, size, size);
  }

  function handleReverse(size: AtomListEmitReverse['data']) {
    sendEmitInBounds(size);
  }

  function handleSort({ size, sortMap }: AtomListEmitSort['data']) {
    for (const [key, node] of Object.entries(weakKeyNodes)) {
      let index = Number(key);
      index = index >= 0 ? index : index + size;
      if (index === sortMap[index]) {
        continue;
      }
      const isIndexInSizeBounds = index < size;
      if (isIndexInSizeBounds) {
        node?.deref()?.update();
      }
    }
  }

  function handleSplice({
    start,
    deleteCount,
    addCount,
    size,
    oldSize,
  }: AtomListEmitSplice['data']) {
    const end =
      addCount === deleteCount ? start + addCount : Math.max(size, oldSize);
    sendKeyEmitRange(start, end, size);
  }

  return function getKeyedParticle(
    key: number,
    getValue: (key: number) => T | undefined
  ): Atom<T | undefined> {
    let keyNode: SignalNode | undefined = weakKeyNodes[key]?.deref();

    if (keyNode === undefined) {
      keyNode = new SignalNode<unknown>(undefined);
      keyNode.initAsSource();

      finalizationRegistry.register(keyNode, key);

      if (listEmitTerminator === undefined) {
        listEmitTerminator = listEmitter.subscribe((message) => {
          switch (message.type) {
            case COLLECTION_MESSAGE_TYPE_CLEAR:
              handleClear(message.data);
              break;
            case COLLECTION_MESSAGE_TYPE_KEY_ADD:
              handleKeyAdd(message.data);
              break;
            case COLLECTION_MESSAGE_TYPE_KEY_DELETE:
              handleKeyDelete(message.data);
              break;
            case COLLECTION_MESSAGE_TYPE_KEY_WRITE:
              handleKeyWrite(message.data);
              break;
            case COLLECTION_MESSAGE_TYPE_KEY_SWAP:
              handleKeySwap(message.data);
              break;
            case LIST_MESSAGE_TYPE_APPEND:
              handleAppend(message.data);
              break;
            case LIST_MESSAGE_TYPE_REVERSE:
              handleReverse(message.data);
              break;
            case LIST_MESSAGE_TYPE_SORT:
              handleSort(message.data);
              break;
            case LIST_MESSAGE_TYPE_SPLICE:
              handleSplice(message.data);
              break;
          }
        });
      }

      weakKeyNodes[key] = keyNode.weakRef;
      signalNodeCount++;
    }

    return {
      [toValueKey]() {
        return getValue(key);
      },
      [signalKey]: keyNode,
    };
  };
}

// function normalizeIndexStrict(index: number, size: number): number {
//   let normalizedIndex = Math.trunc(index);
//   normalizedIndex =
//     normalizedIndex < 0 ? size + normalizedIndex : normalizedIndex;
//   if (normalizedIndex < 0 || normalizedIndex >= size) {
//     throw new Error(INDEX_OUT_OF_BOUNDS_MESSAGE);
//   }
//   return normalizedIndex;
// }

// function normalizeIndex(index: number, size: number): number | undefined {
//   let normalizedIndex = Math.trunc(index);
//   normalizedIndex =
//     normalizedIndex < 0 ? size + normalizedIndex : normalizedIndex;
//   if (normalizedIndex < 0 || normalizedIndex >= size) {
//     return undefined;
//   }
//   return normalizedIndex;
// }

function createAtomListInternal<T>(
  innerValues: T[],
  rawList: RawAtomList<T>,
  getSignalNode: () => SignalNode,
  listEmitter: Emitter<AtomListEmit>
): AtomList<T> {
  let sizeAtom: CollectionSizeAtom | undefined;

  let getKeyedParticle:
    | ((
        key: number,
        getValue: (key: number) => T | undefined
      ) => Atom<T | undefined>)
    | undefined;

  const list: AtomList<T> = {
    [atomListBrandKey]: true,
    at(index) {
      return (getKeyedParticle ??= createAtomKeyGetter(listEmitter))(
        index,
        rawList.at
      );
    },
    get(index) {
      return (getKeyedParticle ??= createAtomKeyGetter(listEmitter))(
        index,
        rawList.get
      );
    },
    get size() {
      return (sizeAtom ??= new CollectionSizeAtom(
        innerValues,
        getSignalNode()
      ));
    },
    [toValueKey]() {
      return rawList;
    },
    get [signalKey]() {
      return getSignalNode();
    },
    map(mapper) {
      return createMappedAtomListForgetful(
        list,
        listEmitter,
        innerValues,
        mapper
      );
    },
    subscribe(subscriber) {
      return listEmitter.subscribe(subscriber);
    },
  };

  return list;
}

function createMappedRawAtomList<T, U>(
  innerValues: T[],
  mapper: (value: T, index: number) => U
): RawAtomList<U> {
  function* values() {
    for (const [index, value] of innerValues.entries()) {
      yield mapper(value, index);
    }
  }

  return {
    get size() {
      return innerValues.length;
    },
    at(index) {
      const size = innerValues.length;
      let normalizedIndex = Math.trunc(index);
      normalizedIndex =
        normalizedIndex < 0 ? size + normalizedIndex : normalizedIndex;

      if (normalizedIndex >= size) {
        return;
      }

      return mapper(innerValues[normalizedIndex]!, normalizedIndex);
    },
    get(index) {
      if (index >> 0 !== index || index < 0 || index >= innerValues.length) {
        return undefined;
      }
      return mapper(innerValues[index]!, index);
    },
    toArray() {
      return innerValues.map(mapper);
    },
    forEach(callback) {
      const size = innerValues.length;
      for (let i = 0; i < size; i++) {
        callback(mapper(innerValues[i]!, i), i);
      }
    },
    forEachInRange(callback, start, end) {
      const size = innerValues.length;
      if (start >> 0 !== start || start < 0 || start >= size) {
        throw new Error(INDEX_OUT_OF_BOUNDS_MESSAGE);
      }
      if (end === undefined) {
        end = size;
      } else if (end > size) {
        throw new Error(INDEX_OUT_OF_BOUNDS_MESSAGE);
      }

      for (let i = start; i < end; i++) {
        callback(mapper(innerValues[i]!, i), i);
      }
    },
    toArraySlice(start, end) {
      const size = innerValues.length;
      if (start === undefined) {
        start = 0;
      } else if (start >> 0 !== start || start < 0 || start >= size) {
        throw new Error(INDEX_OUT_OF_BOUNDS_MESSAGE);
      }
      if (end === undefined) {
        end = size;
      } else if (end > size) {
        throw new Error(INDEX_OUT_OF_BOUNDS_MESSAGE);
      }
      const sliced = new Array(end - start);

      for (let i = start; i < end; i++) {
        sliced[i] = mapper(innerValues[i]!, i);
      }

      return sliced;
    },
    [Symbol.iterator]: values,
    *entries() {
      for (const [index, value] of innerValues.entries()) {
        yield [index, mapper(value, index)];
      }
    },
    keys() {
      return innerValues.keys();
    },
    values,
  };
}

// function createMappedAtomListDeferred<T, U>(
//   originalList: AtomList<T>,
//   originalValues: T[],
//   mapper: (value: T) => U
// ): AtomList<U> {
//   const cacheValues: (U | EmptyCacheToken)[] = [];

//   function cacheMapper(value: U | EmptyCacheToken, index: number): U {
//     if (value !== emptyCacheToken) {
//       return value;
//     }

//     const mappedValue = mapper(originalValues[index]!);
//     cacheValues[index] = mappedValue;
//     return mappedValue;
//   }

//   function handleChange(message: AtomListEmit) {
//     switch (message.type) {
//       case COLLECTION_MESSAGE_TYPE_CLEAR: {
//         cacheValues.length = 0;
//         return;
//       }
//       case COLLECTION_MESSAGE_TYPE_KEY_ADD: {
//         const { key, oldSize } = message.data;

//         if (key === oldSize) {
//           cacheValues.push(emptyCacheToken);
//         } else {
//           cacheValues.splice(key, 0, emptyCacheToken);
//         }
//         return;
//       }
//       case COLLECTION_MESSAGE_TYPE_KEY_DELETE: {
//         const { key, size } = message.data;

//         if (key === size) {
//           cacheValues.length = size;
//         } else {
//           cacheValues.splice(key, 1);
//         }
//         return;
//       }
//       case COLLECTION_MESSAGE_TYPE_KEY_WRITE: {
//         cacheValues[message.data.key] = emptyCacheToken;
//         return;
//       }
//       case COLLECTION_MESSAGE_TYPE_KEY_SWAP: {
//         const [keyA, keyB] = message.data.keySwap;
//         const tmp = cacheValues[keyA]!;
//         cacheValues[keyA] = cacheValues[keyB]!;
//         cacheValues[keyB] = tmp;
//         return;
//       }
//       case LIST_MESSAGE_TYPE_APPEND: {
//         const { size, oldSize } = message.data;
//         cacheValues.length = size;
//         cacheValues.fill(emptyCacheToken, oldSize);
//         return;
//       }
//       case LIST_MESSAGE_TYPE_REVERSE: {
//         cacheValues.reverse();
//         return;
//       }
//       case LIST_MESSAGE_TYPE_SORT: {
//         const { sortMap } = message.data;
//         const tmpCacheValues = cacheValues.slice();
//         for (const [index, oldIndex] of sortMap.entries()) {
//           cacheValues[index] = tmpCacheValues[oldIndex]!;
//         }
//         return;
//       }
//       case LIST_MESSAGE_TYPE_SPLICE: {
//         const { start, deleteCount, addCount } = message.data;
//         if (addCount === 0) {
//           cacheValues.splice(start, deleteCount);
//         } else {
//           const adds: EmptyCacheToken[] = [];
//           adds.length = addCount;
//           adds.fill(emptyCacheToken);
//           cacheValues.splice(start, deleteCount, ...adds);
//         }
//         return;
//       }
//       default: {
//         throw new Error('Unhandled emit', { cause: message });
//       }
//     }
//   }

//   const rawList = createMappedRawAtomList(cacheValues, cacheMapper);
//   cleanupRegistry.register(
//     rawList,
//     originalList[signalKey].subscribe(handleChange)
//   );

//   return createMappedAtomListInternal(
//     originalList,
//     originalValues,
//     rawList,
//     mapper
//   );
// }

// function createMappedAtomListImmediate<T, U>(
//   originalList: AtomList<T>,
//   originalValues: T[],
//   mapper: (value: T) => U
// ): AtomList<U> {
//   const mappedValues: U[] = originalValues.map(mapper);

//   function handleChange(message: AtomListEmit) {
//     switch (message.type) {
//       case COLLECTION_MESSAGE_TYPE_CLEAR: {
//         mappedValues.length = 0;
//         return;
//       }
//       case COLLECTION_MESSAGE_TYPE_KEY_ADD: {
//         const { key, oldSize } = message.data;

//         if (key === oldSize) {
//           mappedValues.push(mapper(originalValues[key]!));
//         } else {
//           mappedValues.splice(key, 0, mapper(originalValues[key]!));
//         }
//         return;
//       }
//       case COLLECTION_MESSAGE_TYPE_KEY_DELETE: {
//         const { key, size } = message.data;

//         if (key === size) {
//           mappedValues.length = size;
//         } else {
//           mappedValues.splice(key, 1);
//         }
//         return;
//       }
//       case COLLECTION_MESSAGE_TYPE_KEY_SWAP: {
//         const [keyA, keyB] = message.data.keySwap;
//         const tmp = mappedValues[keyA]!;
//         mappedValues[keyA] = mappedValues[keyB]!;
//         mappedValues[keyB] = tmp;
//         return;
//       }
//       case COLLECTION_MESSAGE_TYPE_KEY_WRITE: {
//         const { key } = message.data;
//         mappedValues[key] = mapper(originalValues[key]!);
//         return;
//       }
//       case LIST_MESSAGE_TYPE_APPEND: {
//         const { size, oldSize } = message.data;
//         const newValues: U[] = [];
//         for (let i = oldSize; i < size; i++) {
//           newValues.push(mapper(originalValues[i]!));
//         }
//         mappedValues.push(...newValues);
//         return;
//       }
//       case LIST_MESSAGE_TYPE_REVERSE: {
//         mappedValues.reverse();
//         return;
//       }
//       case LIST_MESSAGE_TYPE_SORT: {
//         const { sortMap } = message.data;
//         const tmpCacheValues = mappedValues.slice();
//         for (const [index, oldIndex] of sortMap.entries()) {
//           mappedValues[index] = tmpCacheValues[oldIndex]!;
//         }
//         return;
//       }
//       case LIST_MESSAGE_TYPE_SPLICE: {
//         const { start, deleteCount, addCount } = message.data;
//         if (addCount === 0) {
//           mappedValues.splice(start, deleteCount);
//         } else {
//           const adds: U[] = [];
//           const addEnd = start + addCount;
//           for (let i = start; i < addEnd; i++) {
//             adds.push(mapper(originalValues[i]!));
//           }
//           mappedValues.splice(start, deleteCount, ...adds);
//         }
//         return;
//       }
//       default: {
//         throw new Error('Unhandled emit', { cause: message });
//       }
//     }
//   }

//   const rawList = createRawAtomList(mappedValues);
//   cleanupRegistry.register(
//     rawList,
//     originalList[signalKey].subscribe(handleChange)
//   );

//   return createMappedAtomListInternal(
//     originalList,
//     originalValues,
//     rawList,
//     mapper
//   );
// }

function createMappedAtomListForgetful<T, U>(
  originalList: AtomList<T>,
  emitter: Emitter<AtomListEmit>,
  originalValues: T[],
  mapper: (value: T) => U
): AtomList<U> {
  const rawList = createMappedRawAtomList(originalValues, mapper);

  return createMappedAtomListInternal(
    originalList,
    emitter,
    originalValues,
    rawList,
    mapper
  );
}

function createMappedAtomListInternal<T, U>(
  originalList: AtomList<T>,
  listEmitter: Emitter<AtomListEmit>,
  originalValues: T[],
  rawList: RawAtomList<U>,
  originalMapper: (value: T) => U
): AtomList<U> {
  let getKeyedParticle:
    | ((
        key: number,
        getValue: (key: number) => U | undefined
      ) => Atom<U | undefined>)
    | undefined;

  function nestMapper<V>(nestedMapped: (value: U) => V): (value: T) => V {
    return (value) => nestedMapped(originalMapper(value));
  }

  const list: AtomList<U> = {
    [atomListBrandKey]: true,
    at(index: number) {
      return (getKeyedParticle ??= createAtomKeyGetter<U>(listEmitter))(
        Math.trunc(index),
        rawList.at
      );
    },
    get(index: number) {
      return (getKeyedParticle ??= createAtomKeyGetter<U>(listEmitter))(
        index,
        rawList.get
      );
    },
    get size() {
      return originalList.size;
    },
    [toValueKey]() {
      return rawList;
    },
    get [signalKey]() {
      return originalList[signalKey];
    },
    map(mapper) {
      return createMappedAtomListForgetful(
        originalList,
        listEmitter,
        originalValues,
        nestMapper(mapper)
      );
    },
    subscribe(subscriber) {
      return listEmitter.subscribe(subscriber);
    },
  };

  return list;
}
