import { runEmits } from '@metron/core/emitter.js';
// import { runOrbTrim } from '@metron/core/orb.js';

// let canScheduleOrbTrim = true;

// const runScheduledOrbTrim = () => {
//   canScheduleOrbTrim = true;
//   runOrbTrim();
// };

export let run = () => {
  runEmits();
  // TODO: this should be part of a loop?
  // if (canScheduleOrbTrim) {
  //   requestIdleCallback(runScheduledOrbTrim);
  // }
  // requestAnimationFrame(run);
};
