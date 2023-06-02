import type { Atom } from './particle.js';

export const atomIteratorKey = Symbol('metron-particle-iterator');

export type AtomIterator<T> = Atom<IterableIterator<T>>;

export interface AtomIterable<T> {
  [atomIteratorKey](): AtomIterator<T>;
}

export function isAtomIterable<T>(value: unknown): value is AtomIterable<T> {
  return (value as any)?.[atomIteratorKey] !== undefined;
}
