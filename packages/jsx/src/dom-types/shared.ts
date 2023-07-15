import type { Atom } from 'metron-core/atom.js';

export type AtomOrValue<T> = Atom<T> | T;
