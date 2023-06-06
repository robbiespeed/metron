import {
  atomIteratorKey,
  type AtomIterator,
  type AtomIterable,
} from './iterable.js';
import type { Atom } from './particle.js';

export const collectionBrandKey = Symbol('MetronAtomCollectionBrand');

export const COLLECTION_EMIT_TYPE_KEY_CHANGE = 'CollectionKeyChange';
export const COLLECTION_EMIT_TYPE_SLICE_CHANGE = 'CollectionSliceChange';
export const COLLECTION_EMIT_TYPE_ALL_CHANGE = 'CollectionAllChange';

export interface AtomCollectionEmitChangeKey<TKey = unknown> {
  readonly type: typeof COLLECTION_EMIT_TYPE_KEY_CHANGE;
  readonly key: TKey;
  readonly newSize: number;
  readonly oldSize: number;
}

export interface AtomCollectionEmitChangeSlice<TKey = unknown> {
  readonly type: typeof COLLECTION_EMIT_TYPE_SLICE_CHANGE;
  readonly keyStart: TKey;
  readonly keyEnd: TKey;
  readonly newSize: number;
  readonly oldSize: number;
}

export interface AtomCollectionEmitChangeAll {
  readonly type: typeof COLLECTION_EMIT_TYPE_ALL_CHANGE;
  readonly newSize: number;
  readonly oldSize: number;
}

export type AtomCollectionEmitChange<TKey = unknown> =
  | AtomCollectionEmitChangeKey<TKey>
  | AtomCollectionEmitChangeSlice<TKey>
  | AtomCollectionEmitChangeAll;

export interface RawAtomCollection<TValue, TKey = unknown> {
  readonly size: number;
  get(key: TKey): TValue | undefined;
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
  TEmitData extends AtomCollectionEmitChange<TKey> = AtomCollectionEmitChange<TKey>
> extends Atom<TRaw, TEmitData> {
  readonly [collectionBrandKey]: true;
  readonly size: Atom<number>;
  get(key: TKey): Atom<TValue | undefined>;
  entries(): AtomIterator<[TKey, TValue]>;
  keys(): AtomIterator<TKey>;
  values(): AtomIterator<TValue>;
  [atomIteratorKey](): AtomIterator<TValue, TEmitData>;
}

export function isAtomCollection(
  value: unknown
): value is AtomCollection<unknown> {
  return (value as any)?.[collectionBrandKey] !== undefined;
}
