import { atomIteratorKey, type AtomIterator } from './iterable.js';
import type { Atom } from './particle.js';

export const collectionValueAtKey = Symbol('MetronAtomCollectionValueAt');

export const COLLECTION_EMIT_TYPE_KEY = 'CollectionKeyEmit';
export const COLLECTION_EMIT_TYPE_KEY_SWAP = 'CollectionKeySwap';
export const COLLECTION_EMIT_TYPE_KEY_BATCH = 'CollectionKeyBatch';
export const COLLECTION_EMIT_TYPE_KEY_SWAP_BATCH = 'CollectionKeySwapBatch';
export const COLLECTION_EMIT_TYPE_ALL_CHANGE = 'CollectionAllChange';

export interface AtomCollectionEmitKey<TKey = unknown> {
  readonly type: typeof COLLECTION_EMIT_TYPE_KEY;
  readonly key: TKey;
  readonly newSize: number;
  readonly oldSize: number;
}

export interface AtomCollectionEmitKeySwap<TKey = unknown> {
  readonly type: typeof COLLECTION_EMIT_TYPE_KEY_SWAP;
  readonly keySwap: readonly [TKey, TKey];
}

export interface AtomCollectionEmitKeyBatch<TKey = unknown> {
  readonly type: typeof COLLECTION_EMIT_TYPE_KEY_BATCH;
  readonly keys: readonly TKey[];
  readonly newSize: number;
  readonly oldSize: number;
}

export interface AtomCollectionEmitKeySwapBatch<TKey = unknown> {
  readonly type: typeof COLLECTION_EMIT_TYPE_KEY_SWAP_BATCH;
  readonly keySwaps: readonly (readonly [TKey, TKey])[];
}

export interface AtomCollectionEmitAll {
  readonly type: typeof COLLECTION_EMIT_TYPE_ALL_CHANGE;
  readonly newSize: number;
  readonly oldSize: number;
}

export interface AtomCollectionEmitMap<TKey = unknown> {
  key: AtomCollectionEmitKey<TKey>;
  keySwap: AtomCollectionEmitKeySwap<TKey>;
  keyBatch: AtomCollectionEmitKeyBatch<TKey>;
  keySwapBatch: AtomCollectionEmitKeySwapBatch<TKey>;
  all: AtomCollectionEmitAll;
}

export type AtomCollectionEmit<TKey = unknown> =
  AtomCollectionEmitMap<TKey>[keyof AtomCollectionEmitMap];

export type AtomCollectionSizedEmit<TKey = unknown> = Exclude<
  AtomCollectionEmit<TKey>,
  AtomCollectionEmitKeySwap | AtomCollectionEmitKeySwapBatch
>;

export interface RawAtomCollection<TValue, TKey = unknown> {
  readonly size: number;
  [collectionValueAtKey](key: TKey): TValue | undefined;
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
  [collectionValueAtKey](key: TKey): Atom<TValue | undefined>;
  entries(): AtomIterator<[TKey, TValue]>;
  keys(): AtomIterator<TKey>;
  values(): AtomIterator<TValue>;
  [atomIteratorKey](): AtomIterator<TValue, TEmitMap[keyof TEmitMap]>;
}

export const ATOM_COLLECTION_EMIT_SIZED_TYPES = {
  [COLLECTION_EMIT_TYPE_KEY]: true,
  [COLLECTION_EMIT_TYPE_KEY_BATCH]: true,
  [COLLECTION_EMIT_TYPE_ALL_CHANGE]: true,
} as const;

export function isAtomCollectionSizedEmit(
  value: AtomCollectionEmit
): value is AtomCollectionSizedEmit {
  return (ATOM_COLLECTION_EMIT_SIZED_TYPES as any)[value.type] === true;
}

export function isAtomCollection(
  value: unknown
): value is AtomCollection<unknown> {
  return (value as any)?.[collectionValueAtKey] !== undefined;
}
