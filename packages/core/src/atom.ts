import { emitterKey, valueOfKey, type Atom } from './particle.js';
import { createSensor } from './sensor.js';

export interface AtomSetter<T> {
  (value: T): T;
}

export type { Atom };

export function createAtom<T>(
  value: T
): [atom: Atom<T>, setAtom: AtomSetter<T>] {
  const { [emitterKey]: emitter, send } = createSensor();

  let storedValue = value;

  const atom: Atom<T> = {
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
