import { runEffects } from '@metron/core/effect.js';
import { runEmits } from '@metron/core/emitter.js';
import { runOrbTrim } from '@metron/core/orb.js';

let canScheduleOrbTrim = true;

const runScheduledOrbTrim = () => {
  canScheduleOrbTrim = true;
  runOrbTrim();
};

export let run = () => {
  runEmits();
  runEffects();
  if (canScheduleOrbTrim) {
    requestIdleCallback(runScheduledOrbTrim);
  }
};
