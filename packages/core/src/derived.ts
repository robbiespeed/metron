import type { Atom } from './atom.js';
import {
  emitterKey,
  valueOfKey,
  type MaybeValueParticle,
  type ValueParticle,
} from './particle.js';
import { createSensor } from './sensor.js';

export interface DerivedAtom<T> extends Atom<T> {
  readonly cachedValue: T | undefined;
  readonly isCacheValid: boolean;
}

type ExtractParticleValue<T> = T extends ValueParticle<infer U> ? U : undefined;
type ExtractParticleValues<T extends readonly MaybeValueParticle[]> = {
  [K in keyof T]: ExtractParticleValue<T[K]>;
};

const dependencyCleanupRegistry = new FinalizationRegistry(
  (dependencyTerminators: (() => void)[]) => {
    for (const terminator of dependencyTerminators) {
      terminator();
    }
  }
);

export function createDerived<const D extends readonly MaybeValueParticle[], T>(
  dependencies: D,
  derive: (...values: ExtractParticleValues<D>) => T
): DerivedAtom<T> {
  const { [emitterKey]: emitter, send } = createSensor();

  let cachedValue: T | undefined;
  let isCacheInvalid = true;

  const triggerChange = () => {
    cachedValue = undefined;
    isCacheInvalid = true;
    send();
  };

  const terminators = dependencies.map((atom) =>
    atom[emitterKey](triggerChange)
  );

  function getValue() {
    if (isCacheInvalid) {
      const values = dependencies.map((atom) =>
        atom[valueOfKey]?.()
      ) as ExtractParticleValues<D>;
      cachedValue = derive(...values);
      isCacheInvalid = false;
    }
    return cachedValue as T;
  }

  dependencyCleanupRegistry.register(emitter, terminators);

  return {
    get untracked() {
      return getValue();
    },
    get isCacheValid() {
      return !isCacheInvalid;
    },
    get cachedValue() {
      return cachedValue;
    },
    [valueOfKey]: getValue,
    [emitterKey]: emitter,
  };
}
