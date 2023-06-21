import type { Disposer } from './emitter.js';
import { emitterKey, type Particle } from './particle.js';

export function createEffect<TEmit>(
  particle: Particle<TEmit>,
  handler: (message?: TEmit) => void
): Disposer {
  handler();
  return particle[emitterKey](handler);
}
