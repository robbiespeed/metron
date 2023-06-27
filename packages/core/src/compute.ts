import type { Atom } from './atom.js';
import { emptyCacheToken, type EmptyCacheToken } from './cache.js';
import { cleanupRegistry } from './cleanup-registry.js';
import { createEmitter, type Emitter } from './emitter.js';
import { createOrb, type OrbContext } from './orb.js';
import { emitterKey, toValueKey, immediateEmitterKey } from './particle.js';
import { scheduleMicroTask } from './schedulers.js';

export interface ComputedAtom<T> extends Atom<T> {
  readonly cachedValue: T | EmptyCacheToken;
  readonly isStable: boolean;
  readonly [immediateEmitterKey]: Emitter<void>;
}

export function compute<T>(run: (context: OrbContext) => T): ComputedAtom<T> {
  const [emitter, send] = createEmitter();
  const [immediateEmitter, immediateSend] = createEmitter();

  const orb = createOrb({ autoStabilize: false });

  const { stabilize, watch, dispose } = orb;

  let cachedValue: T | EmptyCacheToken = emptyCacheToken;
  let isNoEmitScheduled = true;

  function emit() {
    stabilize();
    send();
    isNoEmitScheduled = true;
  }

  watch(() => {
    cachedValue = emptyCacheToken;
    if (isNoEmitScheduled) {
      isNoEmitScheduled = false;
      scheduleMicroTask(emit);
    }
    immediateSend();
  });

  const { context } = orb;

  function getValue() {
    if (cachedValue === emptyCacheToken) {
      cachedValue = run(context);
    }
    return cachedValue!;
  }

  cleanupRegistry.register(emitter, dispose);

  // TODO: untracked could be broken since the orb is still doing tracking work
  return {
    get isStable() {
      return orb.isStable;
    },
    get cachedValue() {
      return cachedValue;
    },
    [toValueKey]: getValue,
    [emitterKey]: emitter,
    [immediateEmitterKey]: immediateEmitter,
  };
}
