import type { Disposer } from './emitter.js';
import { emitterKey, type Particle } from './particle.js';

export function createEffect<TEmit>(
  particle: Particle<TEmit>,
  handler: (message?: TEmit) => void
): Disposer {
  handler();
  return particle[emitterKey](handler);
}

export const autoDisposeRegistry = new FinalizationRegistry(
  (disposer: Disposer) => {
    disposer();
  }
);

export function createAutoDisposeEffect<TEmit>(
  particle: Particle<TEmit>,
  handler: (message?: TEmit) => void,
  ref: object
): Disposer {
  handler();
  const disposer = particle[emitterKey](handler);
  autoDisposeRegistry.register(ref, disposer);
  return disposer;
}
