import type { Atom } from './atom.js';
import { createOrb, entangleOrbWithEmitter, type OrbContext } from './orb.js';
import { emitterKey, valueOfKey } from './particle.js';
import { createSensor } from './sensor.js';

export interface Computed<T> extends Atom<T> {
  readonly cachedValue: T | undefined;
  readonly isCacheValid: boolean;
}

const dependencyCleanupRegistry = new FinalizationRegistry(
  (cleanup: () => void) => {
    cleanup();
  }
);

export function createComputed<T>(
  get: (context: OrbContext) => T
): Computed<T> {
  const { [emitterKey]: emitter, send } = createSensor();

  const orb = createOrb();

  entangleOrbWithEmitter(orb, emitter);

  let cachedValue: T | undefined;
  let isCacheInvalid = true;

  orb.watch(() => {
    cachedValue = undefined;
    isCacheInvalid = true;
    send();
  });

  const { context } = orb;

  function getValue() {
    if (isCacheInvalid) {
      cachedValue = get(context);
      isCacheInvalid = false;
    }
    return cachedValue!;
  }

  dependencyCleanupRegistry.register(emitter, orb.clearWatched);

  // TODO: untracked could be broken since the orb is still doing tracking work
  return {
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
