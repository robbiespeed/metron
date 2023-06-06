import type { Atom } from './particle.js';

export const atomIteratorKey = Symbol('MetronAtomIterator');

export type AtomIterator<TValue, TEmitData = unknown> = Atom<
  IterableIterator<TValue>,
  TEmitData
>;

export interface AtomIterable<T> {
  [atomIteratorKey](): AtomIterator<T>;
}

export function isAtomIterable(value: unknown): value is AtomIterable<unknown> {
  return (value as any)?.[atomIteratorKey] !== undefined;
}
