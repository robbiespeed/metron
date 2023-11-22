import type { EmitMessageOption, Emitter } from './emitter.js';
import type { TransmitterOrb } from './orb.js';
import { scheduleMicroTask } from './schedulers.js';
import type { Disposer } from './shared.js';

export const EMITTER = Symbol('Emitter');
export const ORB = Symbol('Orb');

export interface Atom<TValue, TEmit extends EmitMessageOption = void> {
  readonly [ORB]: TransmitterOrb<unknown>;
  readonly [EMITTER]: Emitter<TEmit>;
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

export function microtaskSubscribe(
  atom: Atom<unknown>,
  handler: () => void
): Disposer {
  let isScheduled = false;
  let isActive = true;
  const disposer = atom[EMITTER].subscribe(() => {
    if (isScheduled) {
      return;
    }
    isScheduled = true;
    scheduleMicroTask(() => {
      if (isActive) {
        handler();
        isScheduled = false;
      }
    });
  });

  return () => {
    disposer();
    isActive = false;
  };
}

export function runAndMicrotaskSubscribe(
  atom: Atom<unknown>,
  handler: () => void
): Disposer {
  handler();
  let isScheduled = false;
  let isActive = true;
  const disposer = atom[EMITTER].subscribe(() => {
    if (isScheduled) {
      return;
    }
    isScheduled = true;
    scheduleMicroTask(() => {
      if (isActive) {
        handler();
        isScheduled = false;
      }
    });
  });

  return () => {
    disposer();
    isActive = false;
  };
}
