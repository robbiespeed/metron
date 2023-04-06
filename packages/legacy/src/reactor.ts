import { createOrb, Orb } from './orb';

export function createReactor (
  callback: (watch: Orb['connect']) => void,
  signalScheduler?: (callback: () => void) => void
) {
  const { watch, connect, clearWatched } = createOrb({ signalScheduler });

  const terminator = watch(callback);

  if (signalScheduler) {
    signalScheduler(() => callback(connect));
  }
  else {
    callback(connect);
  }

  return () => {
    terminator();
    clearWatched();
  };
}
