import { createOrb, type OrbContext } from './orb.js';

export function createReactor(
  callback: (context: OrbContext) => void,
  signalScheduler?: (callback: () => void) => void
) {
  const { watch, context, clearWatched } = createOrb({ signalScheduler });

  // TODO: If signalScheduler option is removed from orb,
  // then signalScheduler can be used directly here instead
  const disposer = watch(() => callback(context));

  if (signalScheduler) {
    signalScheduler(() => callback(context));
  } else {
    callback(context);
  }

  return () => {
    disposer();
    clearWatched();
  };
}
