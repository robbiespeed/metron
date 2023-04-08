import {
  createOrb,
  entangleOrbWithEmitter,
  type OrbContext,
  createSensor,
  emitterKey,
  valueOfKey,
} from '@metron/core';
import { type Atom } from './atom.js';

export interface Computed<T> extends Atom<T> {
  readonly cachedValue: T | undefined;
  readonly isComputed: boolean;
}

export function createComputed<T>(
  get: (context: OrbContext) => T
): Computed<T> {
  const { [emitterKey]: emitter, send } = createSensor();

  const orb = createOrb();

  entangleOrbWithEmitter(orb, emitter);

  let cachedValue: T | undefined;
  let isNotComputed = true;

  orb.watch(() => {
    cachedValue = undefined;
    isNotComputed = true;
    send();
  });

  const { context } = orb;

  function getValue() {
    if (isNotComputed) {
      cachedValue = get(context);
      isNotComputed = false;
    }
    return cachedValue!;
  }

  return {
    get untracked() {
      return getValue();
    },
    get isComputed() {
      return !isNotComputed;
    },
    get cachedValue() {
      return cachedValue;
    },
    [valueOfKey]: getValue,
    [emitterKey]: emitter,
  };
}
