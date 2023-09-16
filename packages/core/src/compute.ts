import type { Atom } from './atom.js';
import { emptyCacheToken, type EmptyCacheToken } from './cache.js';
import {
  createReactiveContext,
  type ReactiveContext,
} from './reactive-context.js';
import { signalKey, toValueKey } from './particle.js';
import { SignalNode } from './signal-node.js';

function computedInterceptor(this: SignalNode<Computed<unknown>>) {
  const meta = this.meta;
  if ((meta as any).store === emptyCacheToken) {
    return false;
  }
  (meta as any).store = emptyCacheToken;

  return true;
}

class Computed<T> implements Atom<T> {
  private node = new SignalNode<Computed<unknown>>(this, computedInterceptor);
  readonly [signalKey] = this.node as SignalNode;
  private store: T | typeof emptyCacheToken = emptyCacheToken;
  private comp: (context: ReactiveContext) => T;
  private context: ReactiveContext;
  constructor(comp: (context: ReactiveContext) => T) {
    const { node } = this;
    node.initAsSource();
    node.initAsConsumer();
    this.context = createReactiveContext(node as SignalNode);
    this.comp = comp;
  }
  private run() {
    return this.comp(this.context);
  }
  get cachedValue() {
    return this.store;
  }
  [toValueKey](): T {
    const current = this.store;
    if (current === emptyCacheToken) {
      return (this.store = this.run());
    }
    return current;
  }
}

export interface ComputedAtom<T> extends Atom<T> {
  readonly cachedValue: T | EmptyCacheToken;
}

export function compute<T>(
  run: (context: ReactiveContext) => T
): ComputedAtom<T> {
  return new Computed(run);
}
