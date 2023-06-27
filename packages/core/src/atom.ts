import { createEmitter } from './emitter.js';
import { emitterKey, toValueKey, type Atom } from './particle.js';

export interface AtomSetter<T> {
  (value: T): T;
}

export type { Atom };

export function createAtom<T>(
  value: T
): [atom: Atom<T>, setAtom: AtomSetter<T>] {
  const [emitter, send] = createEmitter();

  let storedValue = value;

  const atom: Atom<T> = {
    [toValueKey]() {
      return storedValue;
    },
    [emitterKey]: emitter,
  };

  return [
    atom,
    (value: T) => {
      if (value === storedValue) {
        return value;
      }

      storedValue = value;
      send();

      return value;
    },
  ];
}

export interface AtomMutator<T> {
  (mutate: (oldValue: T) => T): T;
}

export function createMutatorAtom<T>(
  value: T
): [atom: Atom<T>, mutateAtom: AtomMutator<T>] {
  const [emitter, send] = createEmitter();

  let storedValue = value;

  const atom: Atom<T> = {
    [toValueKey]() {
      return storedValue;
    },
    [emitterKey]: emitter,
  };

  return [
    atom,
    (mutate: (oldValue: T) => T) => {
      const value = mutate(storedValue);
      if (value === storedValue) {
        return value;
      }

      storedValue = value;
      send();

      return value;
    },
  ];
}
