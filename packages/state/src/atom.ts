import {
  createSensor,
  ValueParticle,
  emitterKey,
  valueOfKey,
} from '@metron/core';

export interface Atom<T> extends ValueParticle<T> {
  readonly untracked: T;
}

export interface AtomSetter<T> {
  (value: T): T;
}

export function createAtom<T>(
  value: T
): [atom: Atom<T>, setAtom: AtomSetter<T>] {
  const { [emitterKey]: emitter, send } = createSensor();

  let storedValue = value;

  const atom: Atom<T> = {
    get untracked() {
      return storedValue;
    },
    [valueOfKey]() {
      return storedValue;
    },
    [emitterKey]: emitter,
  };

  return [
    atom,
    <S extends T>(value: S) => {
      if (value === storedValue) {
        return value;
      }

      storedValue = value;

      send();

      return value;
    },
  ];
}
