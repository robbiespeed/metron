// import { emptyCacheToken, type EmptyCacheToken } from './cache.js';
// import { cleanupRegistry } from './cleanup-registry.js';
// import {
//   COLLECTION_EMIT_TYPE_CLEAR,
//   collectionKeyToValueKey,
//   type AtomCollection,
//   type AtomCollectionEmitMap,
//   type AtomCollectionUntrackedReader as AtomCollectionUntrackedReader,
//   COLLECTION_EMIT_TYPE_KEY_WRITE,
//   COLLECTION_EMIT_TYPE_KEY_ADD,
//   COLLECTION_EMIT_TYPE_KEY_DELETE,
//   COLLECTION_EMIT_TYPE_KEY_SWAP,
// } from './collection.js';
// import { Emitter, type EmitMessage, type EmitSubscriber } from './emitter.js';
// import { signalKey, toValueKey, type Atom } from './particle.js';
// import { SignalNode, type Disposer } from './signal-node.js';

// export const LIST_EMIT_TYPE_APPEND = 'ListAppend';
// export const LIST_EMIT_TYPE_REVERSE = 'ListReverse';
// export const LIST_EMIT_TYPE_SPLICE = 'ListSplice';
// export const LIST_EMIT_TYPE_SORT = 'ListSort';

// export type AtomListEmitAppend = EmitMessage<
//   typeof LIST_EMIT_TYPE_APPEND,
//   {
//     readonly size: number;
//     readonly oldSize: number;
//   }
// >;

// export type AtomListEmitReverse = EmitMessage<
//   typeof LIST_EMIT_TYPE_REVERSE,
//   number
// >;

// export type AtomListEmitSplice = EmitMessage<
//   typeof LIST_EMIT_TYPE_SPLICE,
//   {
//     readonly start: number;
//     readonly deleteCount: number;
//     readonly addCount: number;
//     readonly size: number;
//     readonly oldSize: number;
//   }
// >;

// export type AtomListEmitSort = EmitMessage<
//   typeof LIST_EMIT_TYPE_SORT,
//   {
//     readonly sortMap: number[];
//     readonly size: number;
//   }
// >;

// export interface AtomListEmitMap extends AtomCollectionEmitMap<number> {
//   append: AtomListEmitAppend;
//   reverse: AtomListEmitReverse;
//   splice: AtomListEmitSplice;
//   sort: AtomListEmitSort;
// }

// export type AtomListEmit = AtomListEmitMap[keyof AtomListEmitMap];

// const atomListBrandKey = Symbol('MetronAtomListBrand');

// export function isAtomList(value: unknown): value is AtomListLike<unknown> {
//   return (value as any)?.[atomListBrandKey] === true;
// }

// class AtomListUntrackedReader<T>
//   implements AtomCollectionUntrackedReader<T, number>
// {
//   private innerValues: T[];
//   constructor(innerValues: T[]) {
//     this.innerValues = innerValues;
//   }
//   get size(): number {
//     return this.innerValues.length;
//   }
//   at(index: number): T | undefined {
//     // const { innerValues } = this;
//     // const size = innerValues.length;
//     // let normalizedIndex = Math.trunc(index);
//     // normalizedIndex =
//     //   normalizedIndex < 0 ? size + normalizedIndex : normalizedIndex;
//     return this.innerValues.at(index);
//   }
//   get(index: number): T | undefined {
//     return this.innerValues[index];
//   }
//   toArray(): T[] {
//     return this.innerValues.slice();
//   }
//   toArraySlice(start?: number, end?: number): T[] {
//     return this.innerValues.slice(start, end);
//   }
//   [Symbol.iterator]() {
//     return this.innerValues.values();
//   }
//   entries() {
//     return this.innerValues.entries();
//   }
//   keys() {
//     return this.innerValues.keys();
//   }
//   values() {
//     return this.innerValues.values();
//   }
// }

// interface AtomListLike<T> {
//   readonly [atomListBrandKey]: true;
//   readonly [signalKey]: SignalNode;
//   subscribe(subscriber: EmitSubscriber<AtomListEmitMap>): Disposer;
//   map<U>(mapper: (value: T) => U): AtomListLike<U>;
//   [toValueKey](): AtomListUntrackedReader<T>;
// }

// class AtomList<T> implements AtomListLike<T> {
//   private innerValues: T[];
//   private node = new SignalNode(this);
//   private sizeAtom: Atom<number> | undefined;
//   private emitter = new Emitter<AtomListEmitMap>();
//   readonly [signalKey] = this.node as SignalNode;
//   constructor(innerValues: T[], emitter: Emitter<AtomListEmitMap>) {
//     this.innerValues = innerValues;
//   }
//   get size() {
//     return (this.sizeAtom ??= new CollectionSizeAtom(
//       this.innerValues,
//       this.node as SignalNode
//     ));
//   }
//   subscribe(subscriber: EmitSubscriber<AtomListEmitMap>): Disposer {
//     return this.emitter.subscribe(subscriber);
//   }
//   map<U>(mapper: (value: T) => U): AtomListLike<U> {}
//   [toValueKey]() {
//     return new AtomListUntrackedReader(this.innerValues);
//   }
//   // at(index: number): Atom<T | undefined> {

//   // }
// }

// class MappedAtomListUntrackedReader<T, U>
//   implements AtomCollectionUntrackedReader<U, number>
// {
//   private innerValues: T[];
//   private mapper: (value: T, index: number) => U;
//   constructor(innerValues: T[], mapper: (value: T, index: number) => U) {
//     this.innerValues = innerValues;
//     this.mapper = mapper;
//   }
//   get size(): number {
//     return this.innerValues.length;
//   }
//   at(index: number): U | undefined {
//     const { innerValues } = this;
//     const size = innerValues.length;
//     let normalizedIndex = Math.trunc(index);
//     normalizedIndex =
//       normalizedIndex < 0 ? size + normalizedIndex : normalizedIndex;

//     return this.mapper(this.innerValues[normalizedIndex]!, normalizedIndex);
//   }
//   get(index: number): U | undefined {
//     const { innerValues } = this;
//     const size = innerValues.length;

//     if (index >= size) {
//       return undefined;
//     }

//     return this.mapper(this.innerValues[index]!, index);
//   }
//   toArray(): U[] {
//     return this.innerValues.map(this.mapper);
//   }
//   toArraySlice(start?: number, end?: number): U[] {
//     return this.innerValues.slice(start, end).map(this.mapper);
//   }
//   *[Symbol.iterator]() {
//     const { mapper } = this;
//     for (const [index, value] of this.innerValues.entries()) {
//       yield mapper(value, index);
//     }
//   }
//   *entries() {
//     const { mapper } = this;
//     for (const [index, value] of this.innerValues.entries()) {
//       yield [index, mapper(value, index)] as [number, U];
//     }
//   }
//   keys() {
//     return this.innerValues.keys();
//   }
//   values() {
//     return this[Symbol.iterator]();
//   }
// }

// class MappedAtomList<T, U> implements AtomListLike<U> {
//   private root: AtomList<T>;
//   private innerValues: T[];
//   private node: SignalNode;
//   private mapper: (value: T) => U;
//   readonly [signalKey]: SignalNode;
//   constructor(root: AtomList<T>, mapper: (value: T) => U) {
//     this.root = root;
//     this.innerValues = root['innerValues'];
//     const node = root['node'] as SignalNode;
//     this.node = node;
//     this[signalKey] = node;
//     this.mapper = mapper;
//   }
//   subscribe(subscriber: EmitSubscriber<AtomListEmitMap>): Disposer {
//     return this.root.subscribe(subscriber);
//   }
//   [toValueKey]() {
//     return new MappedAtomListUntrackedReader(this.innerValues, this.mapper);
//   }
// }
