import { EMITTER, ORB, type AtomReader, type Atom } from '../atom.js';
import { createEmitter, type Emitter } from '../emitter.js';
import {
  createRelayOrb,
  createTransmitterOrb,
  Orb,
  type TransmitterOrb,
} from '../orb.js';
import { emptyFn } from '../shared.js';
import { bindableRead } from 'metron-core/internal/read.js';
import {
  ARRAY_CHANGE_STORE,
  ArrayChangeStore,
  HINT_DELETE,
  HINT_INSERT,
  HINT_SET,
  type ReadonlyArrayChangeStore,
} from './array/change-store.js';

export interface AtomArray<TValue> extends Atom<ReadonlyArray<TValue>> {
  [ARRAY_CHANGE_STORE]: ReadonlyArrayChangeStore;
}

const INDEX_OUT_OF_BOUNDS_MESSAGE = 'Index out of bounds';

class AtomArrayWriter<TValue> {
  #inner: TValue[];
  #transmit = emptyFn;
  #emit = emptyFn;
  #changeStore?: ArrayChangeStore;
  constructor(inner: TValue[]) {
    this.#inner = inner;
  }
  set(index: number, value: TValue): this {
    const inner = this.#inner;
    const size = inner.length;
    if (index >> 0 !== index || index < 0 || index >= size) {
      throw new RangeError(INDEX_OUT_OF_BOUNDS_MESSAGE);
    }

    if (value === inner[index]) {
      return this;
    }

    inner[index] = value;
    this.#changeStore?.index(HINT_SET, index);
    this.#emit();
    this.#transmit();
    return this;
  }
  push(value: TValue): void {
    const inner = this.#inner;
    const oldSize = inner.length;
    inner.push(value);
    this.#changeStore?.push(oldSize, 1);
    this.#emit();
    this.#transmit();
  }
  append(values: TValue[]): void {
    const count = values.length;
    if (count === 0) {
      return;
    }
    const inner = this.#inner;
    const oldSize = inner.length;
    inner.push(...values);
    this.#changeStore?.push(oldSize, count);
    this.#emit();
    this.#transmit();
  }
  insert(index: number, value: TValue): void {
    const inner = this.#inner;
    const oldSize = inner.length;
    if (index === oldSize) {
      return this.push(value);
    }

    if (index >> 0 !== index || index < 0 || index > oldSize) {
      throw new RangeError(INDEX_OUT_OF_BOUNDS_MESSAGE);
    }

    if (index === 0) {
      inner.unshift(value);
    } else {
      inner.splice(index, 0, value);
    }

    this.#changeStore?.index(HINT_INSERT, index);
    this.#emit();
    this.#transmit();
  }
  delete(index: number): boolean {
    const inner = this.#inner;
    const oldSize = inner.length;

    if (index >> 0 !== index || index < 0 || index >= oldSize) {
      return false;
    }

    if (index === oldSize - 1) {
      inner.pop()!;
    } else {
      inner.splice(index, 1);
    }

    this.#changeStore?.index(HINT_DELETE, index);
    this.#emit();
    this.#transmit();
    return true;
  }
  swap(indexA: number, indexB: number): void {
    const inner = this.#inner;
    const oldSize = inner.length;

    if (
      indexA >> 0 !== indexA ||
      indexA < 0 ||
      indexA >= oldSize ||
      indexB >> 0 !== indexB ||
      indexB < 0 ||
      indexB >= oldSize
    ) {
      throw new RangeError(INDEX_OUT_OF_BOUNDS_MESSAGE);
    }

    if (indexA === indexB) {
      return;
    }

    if (indexA > indexB) {
      // Normalize so that a < b
      return this.swap(indexB, indexA);
    }

    const temp = inner[indexA];
    inner[indexA] = inner[indexB]!;
    inner[indexB] = temp!;

    this.#changeStore?.swap(indexA, indexB);
    this.#emit();
    this.#transmit();
  }
  clear(): void {
    const inner = this.#inner;
    const oldSize = inner.length;
    if (oldSize === 0) {
      return;
    }
    inner.length = 0;
    this.#changeStore?.clear();
    this.#emit();
    this.#transmit();
  }
  static #AtomArray = class PrimaryAtomArray<TValue>
    implements AtomArray<TValue>
  {
    #inner: TValue[];
    #writer: AtomArrayWriter<TValue>;
    #orb: TransmitterOrb<PrimaryAtomArray<TValue>>;
    #emitter?: Emitter;
    constructor(inner: TValue[], writer: AtomArrayWriter<TValue>) {
      this.#inner = inner;
      this.#writer = writer;
      const { orb, transmit } = createTransmitterOrb(this);
      this.#orb = orb;
      writer.#transmit = transmit;
    }
    get [ORB](): TransmitterOrb {
      return this.#orb;
    }
    get [EMITTER](): Emitter {
      const existingEmitter = this.#emitter;
      if (existingEmitter !== undefined) {
        return existingEmitter;
      }

      const { emitter, emit } = createEmitter();

      this.#emitter = emitter;
      this.#writer.#emit = emit;

      return emitter;
    }
    get [ARRAY_CHANGE_STORE](): ReadonlyArrayChangeStore {
      const existingChangeStore = this.#writer.#changeStore;
      if (existingChangeStore !== undefined) {
        return existingChangeStore;
      }

      const changeStore = new ArrayChangeStore();
      this.#writer.#changeStore = changeStore;

      return changeStore;
    }
    unwrap(): ReadonlyArray<TValue> {
      return this.#inner;
    }
  };
  static create<TKey, TValue>(
    values?: readonly TValue[]
  ): [AtomArray<TValue>, AtomArrayWriter<TValue>] {
    const inner = values === undefined ? [] : values.slice();
    const writer = new AtomArrayWriter(inner);
    return [new AtomArrayWriter.#AtomArray(inner, writer), writer];
  }
}

export const createArray = AtomArrayWriter.create;

const skipToken = Symbol();

type SkipToken = typeof skipToken;

interface DerivedItem<TValue = unknown> {
  index: number;
  outIndex: number;
  isUnstable: boolean;
  read: AtomReader;
  store: TValue | SkipToken;
}

// TODO: use bind createDerivedItem
function createDerivedItem<TIn, TOut>(
  derive: (value: TIn, read: AtomReader) => TOut | SkipToken,
  itemIntercept: (this: Orb<DerivedItem<TOut>>) => boolean,
  inValue: TIn,
  index: number
): DerivedItem<TOut> {
  // TODO: might be able to make this bindable using item.read === arguments.callee
  const readInit: AtomReader = (atom) => {
    if (item.read === readInit) {
      const orb = createRelayOrb(item, itemIntercept);
      item.read = bindableRead.bind(orb) as AtomReader;
    }
    return item.read(atom);
  };
  const item: DerivedItem<TOut> = {
    index,
    outIndex: -1,
    isUnstable: false,
    read: readInit,
    store: skipToken,
  };
  item.store = derive(inValue, readInit);
  return item;
}

function adjustOutIndexesRightOf(
  items: DerivedItem[],
  index: number,
  adjustment: number
) {
  const lookupLength = items.length;
  for (let i = index + 1; i < lookupLength; i++) {
    const item = items[i]!;
    if (item.outIndex !== -1) {
      item.outIndex += adjustment;
    }
  }
}

function findOutIndexLeftOf(items: DerivedItem[], key: number): number {
  let outIndex = -1;
  for (let i = key - 1; outIndex === -1 && i > 0; i--) {
    outIndex = items[i]!.outIndex;
  }
  return outIndex === -1 ? 0 : outIndex;
}

function clearingConnectionHandler(
  this: WeakRef<() => void>,
  didDisconnect: boolean
): boolean {
  const clear = this.deref();
  if (didDisconnect) {
    clear?.();
    return false;
  }
  return clear !== undefined;
}

// export function derivedArray<TInput, TOutput extends TInput>(
//   input: AtomArray<TInput>,
//   derive: (value: TInput, read: AtomReader) => TOutput | SkipToken
// ) {
//   // Initialize with current values
//   const inputConnector = input[ARRAY_CHANGESET_CREATE_CONNECTOR]();

//   const unstableItems: DerivedItem[] = [];
//   const derivedItems: DerivedItem[] = [];
//   const inner: TOutput[] = [];

//   // TODO: hold strong ref to this somewhere
//   const clearAndDestabilize = () => {
//     inner.length = 0;
//     derivedItems.length = 0;
//     stabilizer.destabilize();
//   };

//   function itemIntercept(this: Orb<DerivedItem>) {
//     const d = this.data;
//     if (d.isUnstable) {
//       return false;
//     }
//     d.isUnstable = true;
//     d.store = emptyCacheToken;
//     unstableItems.push(d);
//     stabilizer.destabilize();
//     return true;
//   }

//   const connectionHandler = clearingConnectionHandler.bind(
//     new WeakRef(clearAndDestabilize)
//   );

//   const messageHandler = (message: AtomArrayMessage) => {
//     switch (message.type) {
//       case 'CollectionClear': {
//         const oldSize = inner.length;
//         if (oldSize === 0) {
//           break;
//         }
//         inner.length = 0;
//         derivedItems.length = 0;
//         unstableItems.length = 0;
//         addMessage({
//           type: 'CollectionClear',
//           data: {
//             oldSize,
//             size: 0,
//           },
//         });
//         break;
//       }
//       case 'CollectionKeyAdd': {
//         const { key, oldSize } = message.data;
//         const inValue = input.unwrap()[key]!;
//         const item = createDerivedItem(derive, itemIntercept, inValue, key);
//         const outValue = item.store;

//         if (key === oldSize) {
//           derivedItems.push(item);
//         } else {
//           derivedItems.splice(key, 0, item);
//         }

//         const shouldAdd = outValue !== skipToken;

//         if (shouldAdd) {
//           const outOldSize = inner.length;
//           const insertIndex =
//             key === oldSize
//               ? outOldSize
//               : findOutIndexLeftOf(derivedItems, key);

//           item.outIndex = insertIndex;
//           if (insertIndex === outOldSize) {
//             inner.push(outValue);
//           } else {
//             adjustOutIndexesRightOf(derivedItems, key, 1);
//             inner.splice(insertIndex, 0, outValue);
//           }
//           addMessage({
//             type: 'CollectionKeyAdd',
//             data: {
//               key: insertIndex,
//               oldSize: outOldSize,
//               size: inner.length,
//             },
//           });
//           break;
//         }
//         break;
//       }
//       case 'CollectionKeyDelete': {
//         const { key, size } = message.data;
//         const item = derivedItems[key]!;
//         item.index = -1;
//         item.isUnstable = true;

//         if (key === size) {
//           derivedItems.length = size;
//         } else {
//           derivedItems.splice(key, 1);
//         }

//         const outIndex = item.outIndex;
//         if (outIndex === -1) {
//           break;
//         } else if (key !== size) {
//           adjustOutIndexesRightOf(derivedItems, key - 1, -1);
//         }

//         const filteredOldSize = inner.length;
//         inner.splice(outIndex, 1);
//         addMessage({
//           type: 'CollectionKeyDelete',
//           data: {
//             key: outIndex,
//             oldSize: filteredOldSize,
//             size: inner.length,
//           },
//         });
//         break;
//       }
//       case 'CollectionKeyWrite': {
//         const { key } = message.data;
//         const oldItem = derivedItems[key]!;
//         const oldOutIndex = oldItem.outIndex;
//         const filteredOldSize = inner.length;

//         // Replacing oldItem, since it may have active sources
//         // which could trigger an unintended update for the new value
//         const inValue = input.unwrap()[key]!;
//         const item = createDerivedItem(derive, itemIntercept, inValue, key);
//         const outValue = item.store;
//         derivedItems[key] = item;

//         oldItem.index = -1;
//         oldItem.isUnstable = true;

//         const shouldInclude = outValue !== skipToken;
//         if (oldOutIndex === -1) {
//           if (shouldInclude) {
//             const insertIndex = findOutIndexLeftOf(derivedItems, key);
//             item.outIndex = insertIndex;
//             adjustOutIndexesRightOf(derivedItems, key, 1);
//             inner.splice(insertIndex, 0, outValue);
//             addMessage({
//               type: 'CollectionKeyAdd',
//               data: {
//                 key: insertIndex,
//                 oldSize: filteredOldSize,
//                 size: inner.length,
//               },
//             });
//           }
//           break;
//         }

//         if (shouldInclude) {
//           item.outIndex = oldOutIndex;
//           inner[oldOutIndex] = outValue;
//           addMessage({
//             type: 'CollectionKeyWrite',
//             data: { key: oldOutIndex, size: inner.length },
//           });
//         } else {
//           adjustOutIndexesRightOf(derivedItems, key, -1);
//           inner.splice(oldOutIndex, 1);
//           addMessage({
//             type: 'CollectionKeyDelete',
//             data: {
//               key: oldOutIndex,
//               oldSize: filteredOldSize,
//               size: inner.length,
//             },
//           });
//         }
//         break;
//       }
//       case 'ArrayAppend': {
//         const { oldSize, size } = message.data;
//         const inputValues = input.unwrap();
//         const outOldSize = inner.length;

//         for (let i = oldSize; i < size; i++) {
//           const inValue = inputValues[i]!;
//           const item = createDerivedItem(derive, itemIntercept, inValue, i);
//           const outValue = item.store;
//           item.store = outValue;
//           derivedItems[i] = item;
//           const shouldInclude = outValue !== skipToken;
//           if (shouldInclude) {
//             inner.push(outValue);
//           }
//         }

//         const outSize = inner.length;
//         if (outOldSize !== outSize) {
//           addMessage({
//             type: 'ArrayAppend',
//             data: { oldSize: outOldSize, size: outSize },
//           });
//         }

//         break;
//       }
//       case 'ArrayMove': {
//         // TODO: fix, ensure derivedItems are synced
//         const { from, to, count } = message.data;

//         const itemsToMove = derivedItems.slice(from, from + count);

//         const valuesToMove = [];
//         let outFrom = undefined;

//         for (let i = 0; i < count; i++) {
//           const { outIndex } = itemsToMove[i]!;
//           if (outIndex !== -1) {
//             outFrom ??= outIndex;
//             valuesToMove.push(inner[outIndex]!);
//           }
//         }

//         outFrom ??= -1;
//         const outTo =
//           outFrom === -1 ? -1 : findOutIndexLeftOf(derivedItems, to + 1);

//         if (to > from) {
//           for (let i = from + count; i <= to; i++) {
//             derivedItems[i]!.outIndex -= count;
//           }
//           derivedItems.copyWithin(from, from + count, to + count);
//         } else {
//           for (let i = to; i < from; i++) {
//             derivedItems[i]!.outIndex += count;
//           }
//           derivedItems.copyWithin(to + count, to, from);
//         }

//         for (let i = to, j = 0; i < count; i++, j++) {
//           const item = itemsToMove[j]!;
//           item.index = i;
//           derivedItems[i] = item;
//         }

//         if (outFrom === outTo) {
//           break;
//         }

//         const outCount = valuesToMove.length;
//         if (outTo > outFrom) {
//           inner.copyWithin(outFrom, outFrom + outCount, outTo + outCount);
//         } else {
//           inner.copyWithin(outTo + outCount, outTo, outFrom);
//         }

//         for (let i = outTo, j = 0; j < outCount; i++, j++) {
//           inner[i] = valuesToMove[j]!;
//           itemsToMove[j]!.outIndex = i;
//         }

//         addMessage({
//           type: 'ArrayMove',
//           data: {
//             from: outFrom,
//             to: outTo,
//             count: outCount,
//             size: inner.length,
//           },
//         });
//         break;
//       }
//       case 'ArraySplice': {
//         const { addCount, deleteCount, start } = message.data;

//         let valuesToAdd: TOutput[] | undefined;
//         let lookupsToAdd: (number | undefined)[] | undefined;
//         // let itemsToAdd: TODO[] | undefined;
//         const startItem = derivedItems[start]!;

//         let outStart = startItem.outIndex;
//         if (outStart === -1) {
//           outStart = findOutIndexLeftOf(derivedItems, start);
//         }
//         let outIndexEnd = outStart;
//         let removedItems: DerivedItem[];

//         if (addCount > 0) {
//           valuesToAdd = [];
//           lookupsToAdd = [];
//           const itemsToAdd: DerivedItem[] = [];
//           const inputValues = input.unwrap();
//           const end = start + addCount;
//           for (let i = start; i < end; i++) {
//             const inValue = inputValues[i]!;
//             const item = createDerivedItem(derive, itemIntercept, inValue, i);
//             const outValue = item.store;
//             itemsToAdd.push(item);
//             const shouldAdd = outValue !== skipToken;
//             if (shouldAdd) {
//               valuesToAdd.push(outValue);
//               item.outIndex = outIndexEnd++;
//             } else {
//               lookupsToAdd.push(undefined);
//             }
//           }
//           removedItems = derivedItems.splice(start, deleteCount, ...itemsToAdd);
//         } else {
//           removedItems = derivedItems.splice(start, deleteCount);
//         }

//         let outDeleteCount = 0;
//         if (deleteCount !== 0) {
//           for (const item of removedItems) {
//             item.index = -1;
//             item.isUnstable = true;
//             if (item.outIndex === -1) {
//               outDeleteCount++;
//             }
//           }
//         }

//         const innerOldSize = inner.length;
//         let outAddCount: number;

//         if (valuesToAdd === undefined) {
//           if (outDeleteCount === 0) {
//             break;
//           }
//           outAddCount = 0;
//           adjustOutIndexesRightOf(derivedItems, start - 1, -outDeleteCount);
//           inner.splice(outStart, outDeleteCount);
//         } else {
//           outAddCount = valuesToAdd.length;
//           const outDelta = outAddCount - outDeleteCount;
//           if (outDelta !== 0) {
//             adjustOutIndexesRightOf(derivedItems, start - 1, outDelta);
//           }
//           inner.splice(outStart, outDeleteCount, ...valuesToAdd);
//         }

//         if (outAddCount === 1) {
//           addMessage({
//             type: 'CollectionKeyAdd',
//             data: {
//               key: outStart,
//               size: inner.length,
//               oldSize: innerOldSize,
//             },
//           });
//         } else {
//           addMessage({
//             type: 'ArraySplice',
//             data: {
//               start: outStart,
//               addCount: outAddCount,
//               deleteCount: 0,
//               size: inner.length,
//               oldSize: innerOldSize,
//             },
//           });
//         }
//         break;
//       }
//       default: {
//         throw new TypeError(
//           `Unexpected message of type "${
//             //@ts-expect-error message should be never
//             message.type
//           }"`
//         );
//       }
//     }

//     return true;
//   };

//   const noMessageHandler = (isSubscribed: boolean) => {
//     if (isSubscribed) {
//       return;
//     }
//     inputQueue.subscribe(connectionHandler);
//     const inputInner = input.unwrap();
//     const inputLength = inputInner.length;
//     if (inputLength === 0) {
//       return;
//     }

//     for (let i = 0; i < inputLength; i++) {
//       const inValue = inputInner[i]!;
//       const item = createDerivedItem(derive, itemIntercept, inValue, i);
//       const outValue = item.store;
//       derivedItems.push(item);
//       if (outValue !== skipToken) {
//         item.outIndex = inner.length;
//         inner.push(outValue);
//       }
//     }
//   };

//   const stabilizer = new Stabilizer(() => {
//     // inputQueue.pull(connectionHandler, messageHandler, noMessageHandler);

//     const unstableItemCount = unstableItems.length;
//     if (unstableItemCount === 0) {
//       return;
//     }

//     const inputValues = input.unwrap();

//     // TODO aggregate add and removal messages, or rely on shrink
//     for (const item of unstableItems) {
//       const inIndex = item.index;
//       if (inIndex === -1) {
//         // item has been removed as part of message sync
//         continue;
//       }
//       const inValue = inputValues[inIndex]!;
//       const outIndex = item.outIndex;
//       const outValue = derive(inValue, item.read);
//       item.isUnstable = false;
//       item.store = outValue;

//       if (outValue === skipToken) {
//         if (outIndex === -1) {
//           continue;
//         }

//         // remove from inner
//         const oldSize = inner.length;
//         inner.splice(outIndex, 1);
//         item.outIndex = -1;
//         adjustOutIndexesRightOf(derivedItems, inIndex, -1);
//         // addMessage({
//         //   type: 'CollectionKeyDelete',
//         //   data: { key: outIndex, oldSize, size: inner.length },
//         // });
//       } else if (outIndex === -1) {
//         // insert into inner
//         const nextOutIndex = findOutIndexLeftOf(derivedItems, inIndex);
//         const oldSize = inner.length;
//         inner.splice(nextOutIndex, 0, outValue);
//         item.outIndex = nextOutIndex;
//         adjustOutIndexesRightOf(derivedItems, inIndex, 1);
//         // addMessage({
//         //   type: 'CollectionKeyAdd',
//         //   data: { key: nextOutIndex, oldSize, size: inner.length },
//         // });
//       } else {
//         // update inner
//         inner[outIndex] = outValue;
//         // addMessage({
//         //   type: 'CollectionKeyWrite',
//         //   data: { key: outIndex, size: inner.length },
//         // });
//       }
//     }

//     unstableItems.length = 0;
//   });
//   const orb = createRelayOrb(stabilizer, Stabilizer.intercept, [input[ORB]]);

//   return new StabilizedAtomArray(inner, stabilizer, orb, queue, () => {
//     inputQueue.purge(connectionHandler);
//     clearAndDestabilize();
//   });
// }

// function mapHandler<TInput, TOutput extends TInput>(
//   inputInner: ReadonlyArray<TInput>,
//   writer: AtomArrayWriter<TOutput>,
//   mapper: (value: TInput) => TOutput,
//   message: AtomArrayMessage
// ) {
//   switch (message.type) {
//     case 'CollectionClear': {
//       writer.clear();
//       return;
//     }
//     case 'CollectionKeyWrite':
//     case 'CollectionKeyAdd': {
//       const { key } = message.data;
//       writer.set(key, mapper(inputInner[key]!));
//       return;
//     }
//     case 'CollectionKeyDelete': {
//       const { key } = message.data;
//       writer.delete(key);
//       return;
//     }
//     case 'ArrayAppend': {
//       const { oldSize, size } = message.data;
//       const outputValues: TOutput[] = [];
//       for (let i = oldSize; i < size; i++) {
//         outputValues.push(mapper(inputInner[i]!));
//       }
//       writer.append(outputValues);
//       return;
//     }
//   }

//   throw new TypeError(`Unhandled message of type "${message.type}"`);
// }

// export function createMappedArray<TInput, TOutput extends TInput>(
//   input: AtomArray<TInput>,
//   mapper: (value: TInput) => TOutput
// ) {
//   // Initialize with current values
//   const inputInner = input.unwrap();
//   const initialValues: TOutput[] = [];
//   for (const value of inputInner) {
//     initialValues.push(mapper(value));
//   }
//   const [output, writer] = createArray(initialValues);

//   // Sync updates
//   input[EMITTER].subscribe(
//     mapHandler.bind(undefined, inputInner, writer as any, mapper as any)
//   );

//   return output;
// }
