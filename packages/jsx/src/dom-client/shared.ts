import type { Disposer, Particle } from 'metron-core';
import type { EffectLike } from 'metron-core/effect.js';
import { signalKey } from 'metron-core/particle.js';

const animationFrameScheduledCallbacks: (() => void)[] = [];
const animationFrameScheduledEffects: EffectLike[] = [];

let canRequestFrame = true;

function runAnimationFrame() {
  for (const cb of animationFrameScheduledCallbacks) {
    try {
      cb();
    } catch (err) {
      console.error(err);
    }
  }
  animationFrameScheduledCallbacks.length = 0;
  for (const effect of animationFrameScheduledEffects) {
    try {
      effect.run();
    } catch (err) {
      console.error(err);
    }
  }
  animationFrameScheduledEffects.length = 0;
  canRequestFrame = true;
}

export function animationFrameEffectScheduler(effect: EffectLike) {
  animationFrameScheduledEffects.push(effect);
  if (canRequestFrame) {
    canRequestFrame = false;
    requestAnimationFrame(runAnimationFrame);
  }
}

export function animationFrameScheduler(callback: () => void) {
  animationFrameScheduledCallbacks.push(callback);
  if (canRequestFrame) {
    canRequestFrame = false;
    requestAnimationFrame(runAnimationFrame);
  }
}

export function renderSubscribe(
  particle: Particle,
  handler: () => void
): Disposer {
  let isScheduled = false;
  let isActive = true;
  const disposer = particle[signalKey].subscribe(() => {
    if (isScheduled) {
      return;
    }
    isScheduled = true;
    animationFrameScheduler(() => {
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

export function runAndRenderSubscribe(
  particle: Particle,
  handler: () => void
): Disposer {
  handler();
  let isScheduled = false;
  let isActive = true;
  const disposer = particle[signalKey].subscribe(() => {
    if (isScheduled) {
      return;
    }
    isScheduled = true;
    animationFrameScheduler(() => {
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
