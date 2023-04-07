import { createOrb, OrbContext } from './orb.js';

export function createReactor(
  callback: (context: OrbContext) => void,
  signalScheduler?: (callback: () => void) => void
) {
  const { watch, context, clearWatched } = createOrb({ signalScheduler });

  const terminator = watch(() => callback(context));

  if (signalScheduler) {
    signalScheduler(() => callback(context));
  } else {
    callback(context);
  }

  return () => {
    terminator();
    clearWatched();
  };
}
