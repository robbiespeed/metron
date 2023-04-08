import { createSensor } from './sensor';
import type { Particle } from './types';

export interface Cell<T> extends Particle<undefined> {
  readonly value: T;
  notify(): void;
}

export function createCell<T>(value: T): Cell<T> {
  const { watch, send } = createSensor();

  return {
    value,
    notify: send,
    watch,
  };
}
