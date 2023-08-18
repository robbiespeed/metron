import type { Atom } from './atom.js';
import { emptyCacheToken, type EmptyCacheToken } from './cache.js';
import { Emitter } from './emitter.js';
import {
  createReactiveContext,
  type ReactiveContext,
} from './reactive-context.js';
import { emitterKey, toValueKey } from './particle.js';
// import { scheduleCleanup } from './schedulers.js';

export interface ComputedAtom<T> extends Atom<T, void> {
  readonly cachedValue: T | EmptyCacheToken;
}

export function compute<T>(
  run: (context: ReactiveContext) => T
): ComputedAtom<T> {
  let cachedValue: T | EmptyCacheToken = emptyCacheToken;

  const emitter = new Emitter<void>((send) => {
    cachedValue = emptyCacheToken;
    send();
  });

  const { connectToParent } = emitter;

  const context = createReactiveContext(connectToParent);

  function getValue() {
    if (cachedValue === emptyCacheToken) {
      cachedValue = run(context);
      // TODO: stabilize here? Maybe after x runs?
      emitter.stabilize();
    }
    return cachedValue!;
  }

  return {
    get cachedValue() {
      return cachedValue;
    },
    [toValueKey]: getValue,
    [emitterKey]: emitter,
  };
}
