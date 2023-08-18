import { Emitter } from './emitter.js';
import { emitterKey, type Atom, toValueKey } from './particle.js';

export interface Selector<T> {
  (match: T): Atom<boolean, boolean>;
  <U>(match: T, deriver: (isSelected: boolean) => U): Atom<U, boolean>;
}

export function createSelector<T>(
  initial: T
): [Selector<T>, (value: T) => void] {
  const weakEmitters = new Map<T, WeakRef<Emitter<boolean>>>();
  const senders = new Map<T, (isSelected: boolean) => void>();

  let storedValue = initial;

  const finalizationRegistry = new FinalizationRegistry((value: T) => {
    senders.delete(value);
    weakEmitters.delete(value);
  });

  function set(value: T): void {
    if (storedValue === value) {
      return;
    }
    const oldValue = storedValue;
    storedValue = value;
    senders.get(oldValue)?.(false);
    senders.get(storedValue)?.(true);
  }

  function selector<U>(
    match: T,
    deriver?: (isSelected: boolean) => U
  ): Atom<unknown, boolean> {
    let matchEmitter = weakEmitters.get(match)?.deref();

    if (matchEmitter === undefined) {
      const { emitter: freshMatchEmitter, update: matchSend } =
        Emitter.withUpdater<boolean>();
      matchEmitter = freshMatchEmitter;

      senders.set(match, matchSend);
      weakEmitters.set(match, new WeakRef(matchEmitter));

      finalizationRegistry.register(matchEmitter, match);
    }

    return deriver
      ? {
          [toValueKey]() {
            return deriver(storedValue === match);
          },
          [emitterKey]: matchEmitter,
        }
      : {
          [toValueKey]() {
            return storedValue === match;
          },
          [emitterKey]: matchEmitter,
        };
  }

  return [selector as Selector<T>, set];
}
