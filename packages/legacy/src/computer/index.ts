import { createOrb, entangleOrbWithEmitter, type Orb } from '../orb.js';
import { createSensor } from '../sensor.js';
import type { Particle } from '../types.js';

export interface Computer<T> extends Particle<undefined> {
  readonly value: T;
  readonly cachedValue: T | undefined;
  readonly isComputed: boolean;
}

export function createComputer<T>(
  get: (watch: Orb['connect']) => T
): Computer<T> {
  const { watch, send } = createSensor();

  const orb = createOrb();

  entangleOrbWithEmitter(orb, watch);

  let cachedValue: T | undefined;
  let isNotComputed = true;

  orb.watch(() => {
    cachedValue = undefined;
    isNotComputed = true;
    send();
  });

  const { connect } = orb;

  return {
    get value() {
      if (isNotComputed) {
        cachedValue = get(connect);
        isNotComputed = false;
      }
      return cachedValue!;
    },
    get isComputed() {
      return !isNotComputed;
    },
    get cachedValue() {
      return cachedValue;
    },
    watch,
  };
}
