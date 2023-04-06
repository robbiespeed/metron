import { createSensor } from './sensor';
import { Particle } from './types';

export interface Box <T> extends Particle<undefined> {
  readonly value: T;
  set <S extends T> (value: S): S;
}

export function createBox <T> (value: T): Box<T> {
  const { watch, send } = createSensor();

  const box = {
    value,
    set <S extends T> (value: S) {
      if (value === box.value) {
        return value;
      }

      box.value = value;

      send();

      return value;
    },
    watch,
  };

  return box;
}
