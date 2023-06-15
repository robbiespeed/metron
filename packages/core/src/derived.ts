import type { Atom } from './atom.js';
import { createEmitter } from './emitter.js';
import { emitterKey, toValueKey, type MaybeAtomParticle } from './particle.js';

export interface DerivedAtom<T> extends Atom<T> {
  readonly cachedValue: T | undefined;
  readonly isCacheValid: boolean;
}

// TODO: move to particle.ts and rename for Atom
type ExtractParticleValue<T> = T extends Atom<infer U> ? U : undefined;
type ExtractParticleValues<T extends readonly MaybeAtomParticle[]> = {
  [K in keyof T]: ExtractParticleValue<T[K]>;
};

const dependencyCleanupRegistry = new FinalizationRegistry(
  (dependencyTerminators: (() => void)[]) => {
    for (const terminator of dependencyTerminators) {
      terminator();
    }
  }
);

// const derivedSendKey = Symbol('MetronDerivedEmitterSend');

export function createDerived<const D extends readonly MaybeAtomParticle[], T>(
  dependencies: D,
  derive: (...values: ExtractParticleValues<D>) => T
): DerivedAtom<T> {
  const [emitter, send] = createEmitter();

  // (emitter as any)[derivedSendKey] = send;

  // const weakEmitter = new WeakRef<any>(emitter);

  let cachedValue: T | undefined;
  let isCacheInvalid = true;

  const triggerChange = () => {
    cachedValue = undefined;
    isCacheInvalid = true;
    // weakEmitter.deref()?.[derivedSendKey]();
    send();
  };

  const terminators = dependencies.map((atom) =>
    atom[emitterKey](triggerChange)
  );

  function getValue() {
    if (isCacheInvalid) {
      const values = dependencies.map((atom) =>
        atom[toValueKey]?.()
      ) as ExtractParticleValues<D>;
      cachedValue = derive(...values);
      isCacheInvalid = false;
    }
    return cachedValue as T;
  }

  dependencyCleanupRegistry.register(getValue, terminators);

  return {
    get isCacheValid() {
      return !isCacheInvalid;
    },
    get cachedValue() {
      return cachedValue;
    },
    [toValueKey]: getValue,
    [emitterKey]: emitter,
  };
}
