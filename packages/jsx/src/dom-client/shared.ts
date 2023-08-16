import type { Disposer, EmitHandler, Particle } from 'metron-core';
import { emitterKey } from 'metron-core/particle.js';

export function renderSubscribe<TEmit>(
  particle: Particle<TEmit>,
  handler: EmitHandler<void>
): Disposer {
  let isScheduled = false;
  let isActive = true;
  const disposer = particle[emitterKey](() => {
    if (isScheduled) {
      return;
    }
    isScheduled = true;
    requestAnimationFrame(() => {
      if (isActive) {
        handler();
        isScheduled = false;
      }
    });
  });

  return () => {
    disposer();
    isActive = false;
  };
}

export function runAndRenderSubscribe<TEmit>(
  particle: Particle<TEmit>,
  handler: EmitHandler<void>
): Disposer {
  handler();
  let isScheduled = false;
  let isActive = true;
  const disposer = particle[emitterKey](() => {
    if (isScheduled) {
      return;
    }
    isScheduled = true;
    requestAnimationFrame(() => {
      if (isActive) {
        handler();
        isScheduled = false;
      }
    });
  });

  return () => {
    disposer();
    isActive = false;
  };
}
