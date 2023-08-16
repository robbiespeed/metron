import type { Atom } from './atom.js';
import { emptyCacheToken, type EmptyCacheToken } from './cache.js';
import { cleanupRegistry } from './cleanup-registry.js';
import { createEmitter } from './emitter.js';
import { createOrb, type OrbContext } from './orb.js';
import { emitterKey, toValueKey } from './particle.js';
import { scheduleCleanup } from './schedulers.js';

export interface ComputedAtom<T> extends Atom<T> {
  readonly cachedValue: T | EmptyCacheToken;
  readonly isStable: boolean;
}

export function compute<T>(run: (context: OrbContext) => T): ComputedAtom<T> {
  const [emitter, send] = createEmitter();

  const orb = createOrb({ autoStabilize: false });

  const { watch, dispose, stabilize } = orb;

  let cachedValue: T | EmptyCacheToken = emptyCacheToken;

  let canScheduleStabilize = true;

  watch(() => {
    cachedValue = emptyCacheToken;
    send();
    if (canScheduleStabilize) {
      canScheduleStabilize = false;
      scheduleCleanup(stabilize);
    }
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
  };
}
