import { Emitter } from './emitter.js';
import {
  createAsyncReactiveContext,
  type AsyncReactiveContext,
} from './reactive-context.js';
import { scheduleCleanup } from './schedulers.js';

export function createReactor(
  reaction: (context: AsyncReactiveContext) => void,
  signalScheduler?: (callback: () => void) => void
) {
  let canScheduleStabilize = true;

  let context: AsyncReactiveContext;
  const innerRun = () => {
    context.done();
    context = createAsyncReactiveContext(connectToParent);

    reaction(context);
    if (canScheduleStabilize) {
      canScheduleStabilize = false;
      scheduleCleanup(stabilize);
    }
  };

  const run = signalScheduler ? () => signalScheduler(innerRun) : innerRun;

  const { connectToParent, stabilize, clear } = new Emitter(run);
  context = createAsyncReactiveContext(connectToParent);
  run();

  return () => {
    context.done();
    clear();
  };
}
