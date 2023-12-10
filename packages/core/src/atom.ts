import type { Emitter } from './emitter.js';
import type { TransmitterOrb } from './orb.js';
import type { Disposer } from './shared.js';

export const EMITTER = Symbol('Emitter');
export const ORB = Symbol('Orb');

export interface Atom<TValue> {
  readonly [ORB]: TransmitterOrb<unknown>;
  readonly [EMITTER]: Emitter;
  unwrap(): TValue;
}

export interface AtomReader {
  <T>(atom: Atom<T>): T;
}

export type ExtractAtomValue<T> = T extends Atom<infer U> ? U : undefined;
export type ExtractAtomArrayValues<T extends readonly Atom<unknown>[]> = [
  ...{
    [K in keyof T]: ExtractAtomValue<T[K]>;
  }
];

// TODO: unsure if necessary
type Primitive = symbol | string | number | bigint | boolean | undefined | null;

interface AntiAtom {
  [ORB]?: never;
  [EMITTER]?: never;
}

export type NonAtom = AntiAtom | Primitive;
export type AtomOrNonAtom = Atom<unknown> | NonAtom;

export function subscribe(atom: Atom<unknown>, handler: () => void): Disposer {
  return atom[EMITTER].subscribe(handler);
}

export function runAndSubscribe(
  atom: Atom<unknown>,
  handler: () => void
): Disposer {
  handler();
  return atom[EMITTER].subscribe(handler);
}
