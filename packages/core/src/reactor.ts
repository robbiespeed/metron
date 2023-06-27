import type { Disposer } from './emitter.js';
import { createOrb, type OrbContext } from './orb.js';

export function createReactor(
  run: (context: OrbContext) => void,
  signalScheduler?: (callback: () => void) => void
) {
  const { watch, context, dispose } = createOrb();

  let disposer: Disposer;

  if (signalScheduler) {
    disposer = watch(() => signalScheduler(() => run(context)));
    signalScheduler(() => run(context));
  } else {
    disposer = watch(() => run(context));
    run(context);
  }

  return () => {
    disposer();
    dispose();
  };
}
