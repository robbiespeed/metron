import { signalKey, type Atom, toValueKey } from './particle.js';
import { SignalNode } from './signal-node.js';

export interface Selector<T> {
  (match: T): Atom<boolean>;
  <U>(match: T, deriver: (isSelected: boolean) => U): Atom<U>;
}

export function createSelector<T>(
  initial: T
): [Selector<T>, (value: T) => void] {
  const weakEmitters = new Map<T, WeakRef<SignalNode>>();

  let storedValue = initial;

  const finalizationRegistry = new FinalizationRegistry((value: T) => {
    weakEmitters.delete(value);
  });

  function set(value: T): void {
    if (storedValue === value) {
      return;
    }
    const oldValue = storedValue;
    storedValue = value;
    weakEmitters.get(oldValue)?.deref()?.update();
    weakEmitters.get(storedValue)?.deref()?.update();
  }

  function selector<U>(
    match: T,
    deriver?: (isSelected: boolean) => U
  ): Atom<unknown> {
    let matchEmitter = weakEmitters.get(match)?.deref();

    if (matchEmitter === undefined) {
      const signalNode = new SignalNode(undefined) as SignalNode;
      signalNode.initAsSource();
      matchEmitter = signalNode;

      weakEmitters.set(match, signalNode.weakRef);

      finalizationRegistry.register(matchEmitter, match);
    }

    return deriver
      ? {
          [toValueKey]() {
            return deriver(storedValue === match);
          },
          [signalKey]: matchEmitter,
        }
      : {
          [toValueKey]() {
            return storedValue === match;
          },
          [signalKey]: matchEmitter,
        };
  }

  return [selector as Selector<T>, set];
}
