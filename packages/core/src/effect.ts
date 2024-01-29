import { ORB, type Atom, type AtomReader } from './atom.js';
import { bindableRead } from './internal/read.js';
import { Orb, createReceiverOrb, type ReceiverOrb } from './orb.js';
import { emptyFn, type Disposer } from './shared.js';

const scheduled: Effect[] = [];

const addScheduledEffect = scheduled.push.bind(scheduled);

interface EffectRunner {
  (
    read: AtomReader,
    registerCleanup: (cleanup: Disposer) => void
  ): Promise<void> | void;
}

interface StaticEffectRunner {
  (registerCleanup: (cleanup: Disposer) => void): Promise<void> | void;
}

export class Effect {
  //@ts-expect-error #orb intentionally never gets accessed
  // it's present so there is a hard ref to the orb during the life cycle of the effect
  #orb?: ReceiverOrb<Effect>;
  #run!: () => void;
  #canSchedule = false;
  #cleanup = emptyFn;
  static run() {
    for (let index = 0; index < scheduled.length; index++) {
      const effect = scheduled[index]!;
      const run = effect.#run;
      run();
      effect.#canSchedule = run !== emptyFn;
    }
    scheduled.length = 0;
  }
  static #dispose(this: Effect) {
    this.#canSchedule = false;
    this.#orb = undefined;
    this.#run = emptyFn;
    this.#cleanup();
    this.#cleanup = emptyFn;
  }
  static #intercept(this: Orb<Effect>): boolean {
    const effect = this.data;
    if (effect.#canSchedule) {
      effect.#canSchedule = false;
      effect.#cleanup();
      effect.#cleanup = emptyFn;
      addScheduledEffect(effect);
      return true;
    }
    return false;
  }
  static #disposableRun(this: Effect, read: AtomReader, run: EffectRunner) {
    let isDisposed = false;
    const disposableRead: AtomReader = (atom) => {
      if (isDisposed) {
        // TODO improve message
        throw new Error();
      }
      return read(atom);
    };

    let innerCleanup = emptyFn;

    this.#cleanup = () => {
      isDisposed = true;
      innerCleanup();
    };

    run(disposableRead, (cleanup) => {
      if (innerCleanup === emptyFn) {
        innerCleanup = cleanup;
      } else {
        throw new Error('Cleanup already registered');
      }
    });
  }
  static #registerCleanup(this: Effect, cleanup: Disposer) {
    if (this.#cleanup === emptyFn) {
      this.#cleanup = cleanup;
    } else {
      throw new Error('Cleanup already registered');
    }
  }
  static create(run: EffectRunner, immediate = false): Disposer {
    const effect = new Effect();
    const orb = createReceiverOrb<Effect>(effect, Effect.#intercept);
    const read = bindableRead.bind(orb) as AtomReader;
    effect.#orb = orb;
    effect.#run = Effect.#disposableRun.bind(effect, read, run);
    if (immediate) {
      effect.#run();
    } else {
      addScheduledEffect(effect);
    }
    return Effect.#dispose.bind(effect);
  }
  static createWithSources(
    sources: Atom<unknown>[],
    run: EffectRunner,
    immediate = false
  ): Disposer {
    const effect = new Effect();
    const orb = createReceiverOrb<Effect>(
      effect,
      Effect.#intercept,
      sources.map((atom) => atom[ORB])
    );
    const read = bindableRead.bind(orb) as AtomReader;
    effect.#orb = orb;
    effect.#run = Effect.#disposableRun.bind(effect, read, run);
    if (immediate) {
      effect.#run();
    } else {
      addScheduledEffect(effect);
    }
    return Effect.#dispose.bind(effect);
  }
  static createFromSources(
    sources: Atom<unknown>[],
    run: StaticEffectRunner,
    immediate = false
  ): Disposer {
    const effect = new Effect();
    const orb = createReceiverOrb<Effect>(
      effect,
      Effect.#intercept,
      sources.map((atom) => atom[ORB])
    );
    effect.#orb = orb;
    const registerCleanup = Effect.#registerCleanup.bind(effect);
    effect.#run = run.bind(undefined, registerCleanup);
    if (immediate) {
      effect.#run();
    } else {
      addScheduledEffect(effect);
    }
    return Effect.#dispose.bind(effect);
  }
}

export const effect = Effect.create;

export const runEffects = Effect.run;
