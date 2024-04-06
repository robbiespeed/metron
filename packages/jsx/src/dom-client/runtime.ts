import { runEmits } from '@metron/core/emitter.js';
import { runOrbTrim } from '@metron/core/orb.js';

let canScheduleOrbTrim = true;

const runScheduledOrbTrim = () => {
  canScheduleOrbTrim = true;
  runOrbTrim();
};

export let run = () => {
  runEmits();
  if (canScheduleOrbTrim) {
    requestIdleCallback(runScheduledOrbTrim);
  }
};
