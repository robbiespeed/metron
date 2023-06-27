import type { Atom } from './atom.js';
import { emptyCacheToken, type EmptyCacheToken } from './cache.js';
import { cleanupRegistry } from './cleanup-registry.js';
import { createEmitter, type Emitter } from './emitter.js';
import {
  emitterKey,
  toValueKey,
  type MaybeAtomParticle,
  type ExtractAtomArrayValues,
  immediateEmitterKey,
} from './particle.js';
import { scheduleMicroTask } from './schedulers.js';

export interface DerivedAtom<T> extends Atom<T> {
  readonly cachedValue: T | EmptyCacheToken;
  readonly [immediateEmitterKey]: Emitter<void>;
}

export function derive<const D extends readonly MaybeAtomParticle[], T>(
  dependencies: D,
  run: (...values: ExtractAtomArrayValues<D>) => T
): DerivedAtom<T> {
  const [emitter, send] = createEmitter();
  const [immediateEmitter, immediateSend] = createEmitter();

  let cachedValue: T | EmptyCacheToken = emptyCacheToken;
  let isNoEmitScheduled = true;

  function emit() {
    send();
    isNoEmitScheduled = true;
  }

  function trackedEmitHandler() {
    if (cachedValue === emptyCacheToken) {
      return;
    }
    cachedValue = emptyCacheToken;
    if (isNoEmitScheduled) {
      isNoEmitScheduled = false;
      scheduleMicroTask(emit);
    }
    immediateSend();
  }

  const disposers = dependencies.map((atom) =>
    (atom[immediateEmitterKey] ?? atom[emitterKey])(trackedEmitHandler)
  );

  function getValue() {
    if (cachedValue === emptyCacheToken) {
      const values = dependencies.map((atom) =>
        atom[toValueKey]?.()
      ) as ExtractAtomArrayValues<D>;
      cachedValue = run.apply<undefined, ExtractAtomArrayValues<D>, T>(
        undefined,
        values
      );
    }
    return cachedValue as T;
  }

  cleanupRegistry.register(getValue, () => {
    for (const disposer of disposers) {
      disposer();
    }
  });

  return {
    get cachedValue() {
      return cachedValue;
    },
    [toValueKey]: getValue,
    [emitterKey]: emitter,
    [immediateEmitterKey]: immediateEmitter,
  };
}
