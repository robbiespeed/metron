import { createSensor } from './sensor.js';
import type { Particle } from './types.js';

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
