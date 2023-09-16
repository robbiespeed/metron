import { signalKey, type Particle } from './particle.js';
import {
  createReactiveContext,
  type ReactiveContext,
} from './reactive-context.js';
import { scheduleMicroTask } from './schedulers.js';
import { SignalNode } from './signal-node.js';

export interface EffectLike {
  run(): void;
}

interface EffectInternal extends EffectLike {
  canSchedule: boolean;
  scheduler: (effect: EffectLike) => void;
}

function effectIntercept(this: SignalNode<EffectInternal>) {
  const meta = this.meta as any;
  if (meta.canSchedule) {
    meta.canSchedule = false;
    meta.scheduler(meta);
  }
  return false;
}

function defaultScheduler(effect: EffectLike): void {
  scheduleMicroTask(() => effect.run());
}

interface EffectOptions {
  scheduler?: (effect: EffectLike) => void;
  disableAutoRun?: boolean;
}

export class Effect {
  private node = new SignalNode<Effect>(this, effectIntercept as any);
  private fn: (context: ReactiveContext) => void;
  readonly canSchedule = false;
  readonly scheduler: (effect: Effect) => void;
  private context: ReactiveContext;
  constructor(fn: (context: ReactiveContext) => void, options?: EffectOptions) {
    const { node } = this;
    node.initAsConsumer();
    this.context = createReactiveContext(node as SignalNode);
    this.fn = fn;
    const scheduler = options?.scheduler ?? defaultScheduler;
    this.scheduler = scheduler;
    if (!options?.disableAutoRun) {
      scheduler(this);
    }
  }
  run() {
    this.fn(this.context);
    (this as any).canSchedule = true;
  }
  stop() {
    (this as any).canSchedule = false;
  }
}

export function effect(
  fn: (context: ReactiveContext) => void,
  options?: EffectOptions
) {
  return new Effect(fn, options);
}

export class StaticEffect {
  private node = new SignalNode<StaticEffect>(this, effectIntercept as any);
  private fn: () => void;
  readonly canSchedule = false;
  readonly scheduler: (effect: Effect) => void;
  constructor(sources: Particle[], fn: () => void, options?: EffectOptions) {
    const { node } = this;
    node.initAsConsumer();
    for (const { [signalKey]: sourceNode } of sources) {
      node.recordSource(sourceNode, false);
    }
    this.fn = fn;
    const scheduler = options?.scheduler ?? defaultScheduler;
    this.scheduler = scheduler;
    if (!options?.disableAutoRun) {
      scheduler(this);
    }
  }
  run() {
    this.fn();
    (this as any).canSchedule = true;
  }
  stop() {
    (this as any).canSchedule = false;
  }
}

export function staticEffect(
  sources: Particle[],
  fn: () => void,
  options?: EffectOptions
) {
  return new StaticEffect(sources, fn, options);
}
