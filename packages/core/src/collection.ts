import { atomIteratorKey, type AtomIterator } from './iterable.js';
import type { Atom } from './particle.js';

export const collectionKeyToValueKey = Symbol('MetronAtomCollectionKeyToValue');

export const COLLECTION_EMIT_TYPE_KEY_WRITE = 'CollectionKeyWrite';
export const COLLECTION_EMIT_TYPE_KEY_INSERT = 'CollectionKeyInsert';
export const COLLECTION_EMIT_TYPE_KEY_REMOVE = 'CollectionKeyRemove';
export const COLLECTION_EMIT_TYPE_KEY_SWAP = 'CollectionKeySwap';
export const COLLECTION_EMIT_TYPE_KEY_BATCH = 'CollectionKeyBatch';
export const COLLECTION_EMIT_TYPE_CLEAR = 'CollectionClear';

export interface AtomCollectionEmitKeyWrite<TKey = unknown> {
  readonly type: typeof COLLECTION_EMIT_TYPE_KEY_WRITE;
  readonly key: TKey;
  readonly size: number;
}

export interface AtomCollectionEmitKeyInsert<TKey = unknown> {
  readonly type: typeof COLLECTION_EMIT_TYPE_KEY_INSERT;
  readonly key: TKey;
  readonly size: number;
  readonly oldSize: number;
}

export interface AtomCollectionEmitKeyRemove<TKey = unknown> {
  readonly type: typeof COLLECTION_EMIT_TYPE_KEY_REMOVE;
  readonly key: TKey;
  readonly size: number;
  readonly oldSize: number;
}

export interface AtomCollectionEmitKeySwap<TKey = unknown> {
  readonly type: typeof COLLECTION_EMIT_TYPE_KEY_SWAP;
  readonly keySwap: readonly [TKey, TKey];
  readonly size: number;
}

export interface AtomCollectionEmitClear {
  readonly type: typeof COLLECTION_EMIT_TYPE_CLEAR;
  readonly size: number;
  readonly oldSize: number;
}

export interface AtomCollectionEmitMap<TKey = unknown> {
  keyWrite: AtomCollectionEmitKeyWrite<TKey>;
  keyInsert: AtomCollectionEmitKeyInsert<TKey>;
  keyRemove: AtomCollectionEmitKeyRemove<TKey>;
  keySwap: AtomCollectionEmitKeySwap<TKey>;
  clear: AtomCollectionEmitClear;
}

export type AtomCollectionEmit<TKey = unknown> =
  AtomCollectionEmitMap<TKey>[keyof AtomCollectionEmitMap];

export interface RawAtomCollection<TValue, TKey = unknown> {
  readonly size: number;
  [collectionKeyToValueKey](key: TKey): TValue | undefined;
  [Symbol.iterator](): IterableIterator<TValue>;
  entries(): IterableIterator<[TKey, TValue]>;
  keys(): IterableIterator<TKey>;
  values(): IterableIterator<TValue>;
}

export type GetRawAtomCollectionValue<TRaw> = TRaw extends RawAtomCollection<
  infer TValue
>
  ? TValue
  : never;

export interface AtomCollection<
  TValue,
  TKey = unknown,
  TRaw extends RawAtomCollection<TValue, TKey> = RawAtomCollection<
    TValue,
    TKey
  >,
  TEmitMap extends AtomCollectionEmitMap<TKey> = AtomCollectionEmitMap<TKey>
> extends Atom<TRaw, TEmitMap[keyof TEmitMap]> {
  readonly size: Atom<number>;
  [collectionKeyToValueKey](key: TKey): Atom<TValue | undefined>;
  entries(): AtomIterator<[TKey, TValue]>;
  keys(): AtomIterator<TKey>;
  values(): AtomIterator<TValue>;
  [atomIteratorKey](): AtomIterator<TValue, TEmitMap[keyof TEmitMap]>;
}

export function isAtomCollection(
  value: unknown
): value is AtomCollection<unknown> {
  return (value as any)?.[collectionKeyToValueKey] !== undefined;
}
