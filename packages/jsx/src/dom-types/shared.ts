import type { Atom } from '@metron/core/atom.js';
import type { Slot } from '../slot.js';

export type AtomOrValue<T> = Atom<T> | T;
export type SlottableAtomOrValue<T> = Slot<Atom<T>> | Slot<T> | Atom<T> | T;
