import { createEmitter, type Emitter } from './emitter.js';
import { emitterKey, type Atom, toValueKey } from './particle.js';

export interface Selector<T> {
  (match: T): Atom<boolean>;
  <U>(match: T, deriver: (isSelected: boolean) => U): Atom<U>;
}

export function createSelector<T>(
  initial: T
): [Selector<T>, (value: T) => void] {
  const weakEmitters = new Map<T, WeakRef<Emitter>>();
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
  ): Atom<unknown, unknown> {
    let matchEmitter = weakEmitters.get(match)?.deref();

    if (matchEmitter === undefined) {
      const [freshMatchEmitter, matchSend] = createEmitter();
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
