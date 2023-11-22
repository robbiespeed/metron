import {
  COLLECTION_EMIT_TYPE_KEY_WRITE,
  type AtomCollectionEmitMap,
  COLLECTION_EMIT_TYPE_KEY_SWAP,
  COLLECTION_EMIT_TYPE_CLEAR,
  COLLECTION_EMIT_TYPE_KEY_ADD,
  COLLECTION_EMIT_TYPE_KEY_DELETE,
  type AtomCollection,
  CollectionSizeAtom,
  OrbKeyMap,
  type AtomCollectionEmitKeyAdd,
  type AtomCollectionEmitKeyDelete,
  type AtomCollectionEmitKeyWrite,
  type AtomCollectionEmitKeySwap,
} from './shared.js';
import {
  Emitter,
  type EmitMessage,
  type SubscriptionHandler,
} from '../emitter.js';
import { signalKey, toValueKey, type Atom } from '../particle.js';
import { SignalNode } from '../signal-node.js';

export const ARRAY_EMIT_TYPE_APPEND = 'ArrayAppend';
export const ARRAY_EMIT_TYPE_REVERSE = 'ArrayReverse';
export const ARRAY_EMIT_TYPE_SPLICE = 'ArraySplice';
export const ARRAY_EMIT_TYPE_SORT = 'ArraySort';

export type AtomArrayEmitAppend = EmitMessage<
  typeof ARRAY_EMIT_TYPE_APPEND,
  {
    readonly size: number;
    readonly oldSize: number;
  }
>;

export type AtomArrayEmitReverse = EmitMessage<
  typeof ARRAY_EMIT_TYPE_REVERSE,
  number
>;

export type AtomArrayEmitSplice = EmitMessage<
  typeof ARRAY_EMIT_TYPE_SPLICE,
  {
    readonly start: number;
    readonly deleteCount: number;
    readonly addCount: number;
    readonly size: number;
    readonly oldSize: number;
  }
>;

export type AtomArrayEmitSort = EmitMessage<
  typeof ARRAY_EMIT_TYPE_SORT,
  {
    readonly sortMap: number[];
    readonly size: number;
  }
>;

export interface AtomArrayEmitMap extends AtomCollectionEmitMap<number> {
  append: AtomArrayEmitAppend;
  reverse: AtomArrayEmitReverse;
  splice: AtomArrayEmitSplice;
  sort: AtomArrayEmitSort;
}

export type AtomArrayEmit = AtomArrayEmitMap[keyof AtomArrayEmitMap];

// TODO: extend from collection
export interface UntrackedAtomArray<T> {
  readonly size: number;
  at(offset: number): T | undefined;
  get(index: number): T | undefined;
  forEach(callback: (value: T, index: number) => void): void;
  forEachInRange(
    callback: (value: T, index: number) => void,
    start: number,
    end?: number
  ): void;
  toArray(): T[];
  toArraySlice(start?: number, end?: number): T[];
  [Symbol.iterator](): IterableIterator<T>;
  entries(): IterableIterator<[number, T]>;
  keys(): IterableIterator<number>;
  values(): IterableIterator<T>;
}

// interface FocusParams {
//   transform: () => unknown;

// }

export interface AtomArray<T>
  extends AtomCollection<T, number, UntrackedAtomArray<T>, AtomArrayEmit> {
  get(index: number): Atom<T | undefined>;
  at(offset: number): Atom<T | undefined>;
  map<U>(mapper: (value: T) => U): AtomArray<U>;
  // slice
  // Should focus be the basis for all operations including map, slice, and mapDerive (remove focusDerive)
  // focus: like array.reduce but can short circuit and be used as the basis for all other operations (find, some, every, sort, filter, etc)
  // focusDerive: like focus, but can read from other atoms and react to changes
  // mapDerive: like map, but can read from other atoms and react to changes
  // focus<U extends Atom<any>>(transformer: (source: this, innerValues: readonly T[]) => U): U;
}

const INDEX_OUT_OF_BOUNDS_MESSAGE = 'Index out of bounds';

class AtomArrayWriter<T> {
  private innerValues: T[];
  private updateSignalNode: () => void;
  private emitter: Emitter<AtomArrayEmit>;
  constructor(
    innerValues: T[],
    updateSignalNode: () => void,
    emitter: Emitter<AtomArrayEmit>
  ) {
    this.innerValues = innerValues;
    this.updateSignalNode = updateSignalNode;
    this.emitter = emitter;
  }

  set<TValue extends T>(index: number, value: TValue): TValue {
    const { innerValues } = this;
    const oldSize = innerValues.length;
    let normalizedIndex = Math.trunc(index);
    normalizedIndex =
      normalizedIndex < 0 ? oldSize + normalizedIndex : normalizedIndex;
    if (normalizedIndex < 0 || normalizedIndex >= oldSize) {
      throw new Error(INDEX_OUT_OF_BOUNDS_MESSAGE);
    }

    if (value !== innerValues[index]) {
      innerValues[index] = value;

      this.updateSignalNode();
      this.emitter.send({
        type: COLLECTION_EMIT_TYPE_KEY_WRITE,
        data: {
          key: index,
          size: innerValues.length,
        },
      });
    }
    return value;
  }
  swap(indexA: number, indexB: number): void {
    const { innerValues } = this;
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

    this.updateSignalNode();
    this.emitter.send({
      type: COLLECTION_EMIT_TYPE_KEY_SWAP,
      data: {
        keySwap: [indexA, indexB],
        size: innerValues.length,
      },
    });
  }
  push(value: T): void {
    const { innerValues } = this;
    innerValues.push(value);
    const oldSize = innerValues.length - 1;

    this.updateSignalNode();
    this.emitter.send({
      type: COLLECTION_EMIT_TYPE_KEY_ADD,
      data: {
        key: oldSize,
        oldSize,
        size: innerValues.length,
      },
    });
  }
  append(values: T[]): void {
    const appendCount = values.length;
    if (appendCount === 0) {
      return;
    } else if (appendCount === 1) {
      return this.push(values[0]!);
    }

    const { innerValues } = this;
    const oldSize = innerValues.length;

    innerValues.push(...values);

    const size = innerValues.length;

    this.updateSignalNode();
    this.emitter.send({
      type: ARRAY_EMIT_TYPE_APPEND,
      data: {
        oldSize,
        size,
      },
    });
  }
  insert(index: number, item: T): void {
    const { innerValues } = this;
    const oldSize = innerValues.length;
    if (index === oldSize) {
      return this.push(item);
    }

    if (index >> 0 !== index || index < 0 || index > oldSize) {
      throw new Error(INDEX_OUT_OF_BOUNDS_MESSAGE);
    }

    innerValues.splice(index, 0, item);

    const newSize = innerValues.length;

    this.updateSignalNode();
    this.emitter.send({
      type: COLLECTION_EMIT_TYPE_KEY_ADD,
      data: {
        key: index,
        oldSize,
        size: newSize,
      },
    });
  }
  delete(index: number): boolean {
    const { innerValues } = this;
    const oldSize = innerValues.length;

    if (index >> 0 !== index || index < 0 || index >= oldSize) {
      return false;
    }

    if (index === oldSize - 1) {
      innerValues.pop()!;
    } else {
      innerValues.splice(index, 1) as [T];
    }
    const size = innerValues.length;

    this.updateSignalNode();
    this.emitter.send({
      type: COLLECTION_EMIT_TYPE_KEY_DELETE,
      data: {
        key: index,
        oldSize,
        size,
      },
    });

    return true;
  }
  splice(start: number, deleteCount: number, [...values]: T[] = []): T[] {
    const { innerValues } = this;

    const oldSize = innerValues.length;
    const deletedItems = innerValues.splice(start, deleteCount, ...values);
    const size = innerValues.length;
    const addCount = values.length;
    this.updateSignalNode();
    this.emitter.send({
      type: ARRAY_EMIT_TYPE_SPLICE,
      data: {
        start,
        deleteCount: deletedItems.length,
        addCount,
        oldSize,
        size,
      },
    });
    return deletedItems;
  }
  pop(): T | undefined {
    const { innerValues } = this;
    const oldSize = innerValues.length;

    if (oldSize === 0) {
      return;
    }

    const deletedItem = innerValues.pop();
    const size = innerValues.length;

    this.updateSignalNode();
    this.emitter.send({
      type: COLLECTION_EMIT_TYPE_KEY_DELETE,
      data: {
        key: size,
        oldSize,
        size,
      },
    });

    return deletedItem;
  }
  replace(values: T[]): void {
    const { innerValues } = this;
    const oldSize = innerValues.length;
    if (oldSize === 0) {
      return this.append(values);
    }
    const size = values.length;
    innerValues.splice(0, oldSize, ...values);
    this.updateSignalNode();
    this.emitter.send({
      type: ARRAY_EMIT_TYPE_SPLICE,
      data: {
        start: 0,
        deleteCount: oldSize,
        addCount: size,
        oldSize,
        size,
      },
    });
  }
  reverse(): void {
    const { innerValues } = this;
    const size = innerValues.length;
    if (size === 0) {
      return;
    }
    innerValues.reverse();
    this.updateSignalNode();
    this.emitter.send({
      type: ARRAY_EMIT_TYPE_REVERSE,
      data: size,
    });
  }
  sort(compare: (a: T, b: T) => number): void {
    const { innerValues } = this;
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

    this.updateSignalNode();
    this.emitter.send({
      type: ARRAY_EMIT_TYPE_SORT,
      data: {
        sortMap,
        size,
      },
    });
  }
  clear(): void {
    const { innerValues } = this;
    const oldSize = innerValues.length;
    if (oldSize === 0) {
      return;
    }
    innerValues.length = 0;
    this.updateSignalNode();
    this.emitter.send({
      type: COLLECTION_EMIT_TYPE_CLEAR,
      data: {
        size: 0,
        oldSize,
      },
    });
  }
}

class UntrackedSourceAtomArray<T> implements UntrackedAtomArray<T> {
  private innerValues: T[];
  constructor(innerValues: T[]) {
    this.innerValues = innerValues;
  }
  get size(): number {
    return this.innerValues.length;
  }
  at(offset: number): T | undefined {
    return this.innerValues.at(offset);
  }
  get(index: number): T | undefined {
    return this.innerValues[index];
  }
  forEach(callback: (value: T, index: number) => void): void {
    const { innerValues } = this;
    const size = innerValues.length;
    for (let i = 0; i < size; i++) {
      callback(innerValues[i]!, i);
    }
  }
  forEachInRange(
    callback: (value: T, index: number) => void,
    start: number,
    end?: number
  ): void {
    const { innerValues } = this;
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
  }
  toArray(): T[] {
    return this.innerValues.slice();
  }
  toArraySlice(start?: number, end?: number): T[] {
    return this.innerValues.slice(start, end);
  }
  [Symbol.iterator]() {
    return this.innerValues.values();
  }
  entries() {
    return this.innerValues.entries();
  }
  keys() {
    return this.innerValues.keys();
  }
  values() {
    return this.innerValues.values();
  }
}

class KeyEmitHelper {
  private getWeakTransmit: OrbKeyMap<number, AtomArrayEmit>['weakTransmit'];
  private orbKeyMap: OrbKeyMap<number, AtomArrayEmit>;

  constructor(orbKeyMap: OrbKeyMap<number, AtomArrayEmit>) {
    this.getWeakTransmit = orbKeyMap.weakTransmit;
    this.orbKeyMap = orbKeyMap;
  }

  sendKeyEmit(index: number, size: number) {
    const { getWeakTransmit } = this;
    getWeakTransmit(index)?.deref()?.();
    getWeakTransmit(index - size)?.deref()?.();
  }

  sendEmitInRange(start: number, end: number, size: number) {
    for (const [offset, node] of this.orbKeyMap.weakTransmitEntries()) {
      let index = offset >= 0 ? offset : offset + size;
      const isIndexInRange = index >= start && index <= end;
      if (isIndexInRange) {
        node?.deref()?.();
      }
    }
  }

  sendEmitInBounds(size: number) {
    for (const [offset, node] of this.orbKeyMap.weakTransmitEntries()) {
      const isOffsetInSizeBounds = offset >= 0 ? offset < size : -offset < size;
      if (isOffsetInSizeBounds) {
        node?.deref()?.();
      }
    }
  }

  handleKeyAdd({
    key,
    size,
    oldSize,
  }: AtomCollectionEmitKeyAdd<number>['data']) {
    if (key === oldSize) {
      this.sendKeyEmit(key, size);
    } else {
      this.sendEmitInRange(key, Math.max(size, oldSize), size);
    }
  }

  handleKeyDelete({
    key,
    size,
    oldSize,
  }: AtomCollectionEmitKeyDelete<number>['data']) {
    if (key === oldSize - 1) {
      this.sendKeyEmit(key, size);
    } else {
      this.sendEmitInRange(key, Math.max(size, oldSize), size);
    }
  }

  handleKeyWrite({ key, size }: AtomCollectionEmitKeyWrite<number>['data']) {
    this.sendKeyEmit(key, size);
  }

  handleKeySwap({ keySwap, size }: AtomCollectionEmitKeySwap<number>['data']) {
    const [keyA, keyB] = keySwap;
    this.sendKeyEmit(keyA, size);
    this.sendKeyEmit(keyB, size);
  }

  handleAppend({ oldSize, size }: AtomArrayEmitAppend['data']) {
    this.sendEmitInRange(oldSize, size, size);
  }

  handleReverse(size: AtomArrayEmitReverse['data']) {
    this.sendEmitInBounds(size);
  }

  handleSort({ size, sortMap }: AtomArrayEmitSort['data']) {
    for (const [offset, node] of this.orbKeyMap.weakTransmitEntries()) {
      const index = offset >= 0 ? offset : offset + size;
      if (index === sortMap[index]) {
        continue;
      }
      const isIndexInSizeBounds = index < size;
      if (isIndexInSizeBounds) {
        node?.deref()?.();
      }
    }
  }

  handleSplice({
    start,
    deleteCount,
    addCount,
    size,
    oldSize,
  }: AtomArrayEmitSplice['data']) {
    const end =
      addCount === deleteCount ? start + addCount : Math.max(size, oldSize);
    this.sendEmitInRange(start, end, size);
  }
}

function createNodeKeyMap(emitter: Emitter<AtomArrayEmit>) {
  const nodeKeyMap = new OrbKeyMap<number, AtomArrayEmit>(
    emitter,
    (message: AtomArrayEmit) => {
      switch (message.type) {
        case COLLECTION_EMIT_TYPE_CLEAR:
          helper.sendEmitInBounds(message.data.oldSize);
          break;
        case COLLECTION_EMIT_TYPE_KEY_ADD:
          helper.handleKeyAdd(message.data);
          break;
        case COLLECTION_EMIT_TYPE_KEY_DELETE:
          helper.handleKeyDelete(message.data);
          break;
        case COLLECTION_EMIT_TYPE_KEY_WRITE:
          helper.handleKeyWrite(message.data);
          break;
        case COLLECTION_EMIT_TYPE_KEY_SWAP:
          helper.handleKeySwap(message.data);
          break;
        case ARRAY_EMIT_TYPE_APPEND:
          helper.handleAppend(message.data);
          break;
        case ARRAY_EMIT_TYPE_REVERSE:
          helper.sendEmitInBounds(message.data);
          break;
        case ARRAY_EMIT_TYPE_SORT:
          helper.handleSort(message.data);
          break;
        case ARRAY_EMIT_TYPE_SPLICE:
          helper.handleSplice(message.data);
          break;
      }
    }
  );

  const helper = new KeyEmitHelper(nodeKeyMap);

  return nodeKeyMap;
}

class SourceAtomArray<T> implements AtomArray<T> {
  private innerValues: T[];
  private getSignalNode: () => SignalNode;
  private emitter: Emitter<AtomArrayEmit>;
  private untracked?: UntrackedSourceAtomArray<T>;
  private sizeAtom?: CollectionSizeAtom;
  private nodeKeyMap?: OrbKeyMap<number, AtomArrayEmit>;
  private constructor(
    innerValues: T[],
    getSignalNode: () => SignalNode,
    emitter: Emitter<AtomArrayEmit>
  ) {
    this.innerValues = innerValues;
    this.getSignalNode = getSignalNode;
    this.emitter = emitter;
  }
  get size() {
    return (this.sizeAtom ??= new CollectionSizeAtom(
      this.innerValues,
      this.getSignalNode()
    ));
  }
  get [signalKey]() {
    return this.getSignalNode();
  }
  at(offset: number): Atom<T | undefined> {
    // TODO: int check

    const signalNode = (this.nodeKeyMap ??= createNodeKeyMap(this.emitter)).get(
      offset
    );

    return {
      [signalKey]: signalNode,
      [toValueKey]: () => {
        return this.innerValues.at(offset);
      },
    };
  }
  get(index: number): Atom<T | undefined> {
    // TODO: positive int check
    const signalNode = (this.nodeKeyMap ??= createNodeKeyMap(this.emitter)).get(
      index
    );

    return {
      [signalKey]: signalNode,
      [toValueKey]: () => {
        return this.innerValues[index];
      },
    };
  }
  map<U>(mapper: (value: T) => U): AtomArray<U> {
    return new MappedAtomArray(this, mapper);
  }
  subscribe(handler: SubscriptionHandler<AtomArrayEmit>) {
    return this.emitter.subscribe(handler);
  }
  [toValueKey]() {
    return (this.untracked ??= new UntrackedSourceAtomArray(this.innerValues));
  }
  static create<T>(
    values?: T[]
  ): [reader: SourceAtomArray<T>, writer: AtomArrayWriter<T>] {
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

    const emitter = new Emitter<AtomArrayEmit>();

    return [
      new SourceAtomArray(innerValues, getSignalNode, emitter),
      new AtomArrayWriter(innerValues, updateSignalNode, emitter),
    ];
  }
}

class UntrackedMappedAtomArray<T, U> implements UntrackedAtomArray<U> {
  private sourceValues: T[];
  private mapper: (value: T) => U;
  constructor(innerValues: T[], mapper: (value: T) => U) {
    this.sourceValues = innerValues;
    this.mapper = mapper;
  }
  get size(): number {
    return this.sourceValues.length;
  }
  at(offset: number): U | undefined {
    const { sourceValues: innerValues } = this;
    const size = innerValues.length;
    const index = offset < 0 ? size + Math.trunc(offset) : Math.trunc(offset);

    if (index >= size) {
      return;
    }

    return this.mapper(innerValues[index]!);
  }
  get(index: number): U | undefined {
    const { sourceValues: innerValues } = this;
    if (index >> 0 !== index || index < 0 || index >= innerValues.length) {
      return undefined;
    }

    return this.mapper(innerValues[index]!);
  }
  forEach(callback: (value: U, index: number) => void): void {
    const { sourceValues: innerValues, mapper } = this;
    const size = innerValues.length;
    for (let i = 0; i < size; i++) {
      callback(mapper(innerValues[i]!), i);
    }
  }
  forEachInRange(
    callback: (value: U, index: number) => void,
    start: number,
    end?: number
  ): void {
    const { sourceValues: innerValues, mapper } = this;
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
      callback(mapper(innerValues[i]!), i);
    }
  }
  toArray(): U[] {
    return this.sourceValues.slice().map(this.mapper);
  }
  toArraySlice(start?: number, end?: number): U[] {
    const { sourceValues: innerValues, mapper } = this;

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
      sliced[i] = mapper(innerValues[i]!);
    }

    return sliced;
  }
  [Symbol.iterator]() {
    return this.values();
  }
  *entries(): IterableIterator<[index: number, value: U]> {
    const { mapper } = this;
    for (const [index, value] of this.sourceValues.entries()) {
      yield [index, mapper(value)];
    }
  }
  keys() {
    return this.sourceValues.keys();
  }
  *values(): IterableIterator<U> {
    const { mapper } = this;
    for (const value of this.sourceValues.values()) {
      yield mapper(value);
    }
  }
}

class MappedAtomArray<T, U> implements AtomArray<U> {
  private source: SourceAtomArray<T>;
  private mapper: (value: T) => U;
  private untracked: UntrackedMappedAtomArray<T, U>;
  private nodeKeyMap?: OrbKeyMap<number, AtomArrayEmit>;
  constructor(source: SourceAtomArray<T>, mapper: (value: T) => U) {
    this.source = source;
    this.mapper = mapper;
    this.untracked = new UntrackedMappedAtomArray(
      this.source['innerValues'],
      this.mapper
    );
  }
  get size() {
    return this.source.size;
  }
  get [signalKey]() {
    return this.source['getSignalNode']();
  }
  at(offset: number): Atom<U | undefined> {
    // TODO: int check

    const signalNode = (this.nodeKeyMap ??= createNodeKeyMap(
      this.source['emitter']
    )).get(offset);

    const { untracked } = this;
    return {
      [signalKey]: signalNode,
      [toValueKey]: () => untracked.at(offset),
    };
  }
  get(index: number): Atom<U | undefined> {
    // TODO: positive int check
    const signalNode = (this.nodeKeyMap ??= createNodeKeyMap(
      this.source['emitter']
    )).get(index);

    const { untracked } = this;
    return {
      [signalKey]: signalNode,
      [toValueKey]: () => untracked.get(index),
    };
  }
  map<V>(mapper: (value: U) => V): MappedAtomArray<T, V> {
    const thisMapper = this.mapper;
    return new MappedAtomArray(this.source, (v: T) => mapper(thisMapper(v)));
  }
  subscribe(handler: SubscriptionHandler<AtomArrayEmit>) {
    return this.source.subscribe(handler);
  }
  [toValueKey]() {
    return (this.untracked ??= new UntrackedMappedAtomArray(
      this.source['innerValues'],
      this.mapper
    ));
  }
}

export const createAtomArray = SourceAtomArray.create;
