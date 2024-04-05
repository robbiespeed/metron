import { bindableAssertActive } from '../internal/asserts.js';
import { EMITTER, type Atom, ORB, type AtomReader, IS_ATOM } from '../atom.js';
import { emptyCacheToken, type EmptyCacheToken } from '../cache.js';
import { createEmitter, type Emitter } from '../emitter.js';
import { bindableEphemeralRead } from '../internal/read.js';
import { createRelayOrb, createTransmitterOrb, type Orb } from '../orb.js';
import { ExpiredReadContext, emptyFn } from '../shared.js';

/**
 * @experimental
 */
export interface AsyncAtom<TValue> extends Atom<Promise<TValue>> {
  then(): Promise<Atom<Awaited<TValue>>>;
  then<TResult = Atom<Awaited<TValue>>, TResultFallback = never>(
    handleResolve?:
      | ((value: Atom<Awaited<TValue>>) => TResult | PromiseLike<TResult>)
      | null
      | undefined,
    handleReject?:
      | ((cause: unknown) => PromiseLike<TResultFallback>)
      | null
      | undefined
  ): Promise<Awaited<TResult | TResultFallback>>;
  now(): Atom<Awaited<TValue> | undefined>;
  now<TFallback>(fallback: TFallback): Atom<Awaited<TValue> | TFallback>;
}

interface AsyncDeriveCallback<TValue> {
  (this: AsyncDerivedAtom<TValue>, read: AtomReader, assertActive: () => void):
    | TValue
    | Promise<TValue>;
}

interface StaticAsyncDeriveCallback<TValue> {
  (this: AsyncDerivedAtom<TValue>, assertActive: () => void):
    | TValue
    | Promise<TValue>;
}

/**
 * @experimental
 */
export class AsyncDerivedAtom<TValue> implements AsyncAtom<TValue> {
  #syncOrb?: Orb<undefined>;
  #syncStore: TValue | EmptyCacheToken = emptyCacheToken;
  #syncEmitter?: Emitter;
  #syncEmit = emptyFn;
  #syncTransmit = emptyFn;
  #orb!: Orb<AsyncDerivedAtom<TValue>>;
  #emitter?: Emitter;
  #disposableReceiver?: { receiver?: Orb };
  #emit = emptyFn;
  #store: Promise<TValue> | EmptyCacheToken = emptyCacheToken;
  #derive: (...args: any[]) => Promise<TValue>;
  #innerUnwrap: (this: AsyncDerivedAtom<TValue>) => Promise<TValue>;
  private constructor(derive: any, innerUnwrap: any) {
    this.#derive = derive;
    this.#innerUnwrap = innerUnwrap;
  }
  get [IS_ATOM](): true {
    return true;
  }
  get [EMITTER](): Emitter {
    const existingEmitter = this.#emitter;
    if (existingEmitter !== undefined) {
      return existingEmitter;
    }

    const { emitter, emit } = createEmitter();

    this.#emitter = emitter;
    this.#emit = emit;

    return emitter;
  }
  get [ORB](): Orb {
    return this.#orb;
  }
  async unwrap(): Promise<TValue> {
    while (true) {
      try {
        return await this.#innerUnwrap();
      } catch (cause) {
        if (cause instanceof ExpiredReadContext === false) {
          throw cause;
        }
      }
    }
  }
  then(): Promise<Atom<Awaited<TValue>>>;
  then<TResult = Atom<Awaited<TValue>>, TResultFallback = never>(
    handleResolve?:
      | ((value: Atom<Awaited<TValue>>) => TResult | PromiseLike<TResult>)
      | null
      | undefined,
    handleReject?:
      | ((cause: unknown) => PromiseLike<TResultFallback>)
      | null
      | undefined
  ): Promise<Awaited<TResult | TResultFallback>>;
  async then(
    handleResolve?: (value: any) => any,
    handleReject?: (value: any) => any
  ): Promise<Atom<Awaited<TValue>>> {
    const syncStore = this.#syncStore;
    if (syncStore !== emptyCacheToken) {
      return new AsyncDerivedAtom.#SyncAtom(this, emptyCacheToken as any);
    }
    while (true) {
      try {
        await this.#innerUnwrap();
        break;
      } catch (cause) {
        if (cause instanceof ExpiredReadContext === false) {
          if (handleReject === undefined) {
            throw cause;
          }
          return handleReject(cause);
        }
      }
    }
    if (handleResolve === undefined) {
      return new AsyncDerivedAtom.#SyncAtom(this, emptyCacheToken as any);
    }
    return handleResolve(
      new AsyncDerivedAtom.#SyncAtom(this, emptyCacheToken as any)
    );
  }
  now(): Atom<Awaited<TValue> | undefined>;
  now<const TFallback>(fallback: TFallback): Atom<Awaited<TValue> | TFallback>;
  now(fallback?: unknown): Atom<Awaited<TValue> | any> {
    this.#innerUnwrap();
    return new AsyncDerivedAtom.#SyncAtom(this, fallback);
  }
  #getSyncEmitter(): Emitter {
    const existingEmitter = this.#syncEmitter;
    if (existingEmitter !== undefined) {
      return existingEmitter;
    }

    const { emitter, emit } = createEmitter();

    this.#syncEmitter = emitter;
    this.#syncEmit = emit;

    return emitter;
  }
  #getSyncOrb(): Orb {
    const existingOrb = this.#syncOrb;
    if (existingOrb !== undefined) {
      return existingOrb;
    }

    const { orb, transmit } = createTransmitterOrb();
    this.#syncOrb = orb;
    this.#syncTransmit = transmit;

    return orb;
  }
  static #SyncAtom = class SyncAtom<TValue, TFallback>
    implements Atom<TValue | TFallback>
  {
    #parent: AsyncDerivedAtom<any>;
    #fallback: TFallback;
    constructor(parent: AsyncDerivedAtom<any>, fallback: TFallback) {
      this.#parent = parent;
      this.#fallback = fallback;
    }
    get [IS_ATOM](): true {
      return true;
    }
    get [EMITTER](): Emitter {
      return this.#parent.#getSyncEmitter();
    }
    get [ORB](): Orb {
      return this.#parent.#getSyncOrb();
    }
    unwrap(): TValue | TFallback {
      const value = this.#parent.#syncStore;
      return value === emptyCacheToken ? this.#fallback : value;
    }
  };
  static async #staticInnerUnwrap(
    this: AsyncDerivedAtom<unknown>
  ): Promise<any> {
    const current = this.#store;
    if (current !== emptyCacheToken) {
      return current;
    }

    const previous = this.#disposableReceiver;
    if (previous !== undefined) {
      previous.receiver = undefined;
    }

    const next = (this.#disposableReceiver = { receiver: this.#orb });

    const assertActive = bindableAssertActive.bind(next);

    const promise = (this.#store = this.#derive(assertActive));

    const result = await promise;

    if (promise === this.#store) {
      this.#syncStore = result;
      this.#syncEmit();
      this.#syncTransmit();
      return result;
    }

    throw new ExpiredReadContext();
  }
  static async #dynamicInnerUnwrap(
    this: AsyncDerivedAtom<unknown>
  ): Promise<any> {
    const current = this.#store;
    if (current !== emptyCacheToken) {
      return current;
    }

    const previous = this.#disposableReceiver;
    if (previous !== undefined) {
      previous.receiver = undefined;
    }

    const next = (this.#disposableReceiver = { receiver: this.#orb });

    const assertActive = bindableAssertActive.bind(next);

    const promise = (this.#store = this.#derive(
      bindableEphemeralRead.bind(next),
      assertActive
    ));

    const result = await promise;

    if (promise === this.#store) {
      this.#syncStore = result;
      this.#syncEmit();
      this.#syncTransmit();
      return result;
    }

    throw new ExpiredReadContext();
  }
  static #intercept(this: Orb<AsyncDerivedAtom<unknown>>) {
    const derived = this.data;
    if (derived.#store === emptyCacheToken) {
      return false;
    }
    derived.#store = emptyCacheToken;
    derived.#emit();
    return true;
  }
  static create<TValue>(
    derive: AsyncDeriveCallback<TValue>
  ): AsyncAtom<TValue> {
    const derived = new AsyncDerivedAtom<any>(
      derive,
      AsyncDerivedAtom.#dynamicInnerUnwrap
    );
    const orb = createRelayOrb(derived, AsyncDerivedAtom.#intercept);
    derived.#orb = orb;
    return derived;
  }
  static createWithSources<TValue>(
    sources: Atom<unknown>[],
    derive: AsyncDeriveCallback<TValue>
  ): AsyncAtom<TValue> {
    const derived = new AsyncDerivedAtom<any>(
      derive,
      AsyncDerivedAtom.#dynamicInnerUnwrap
    );
    const orb = createRelayOrb(
      derived,
      AsyncDerivedAtom.#intercept,
      sources.map((atom) => atom[ORB])
    );
    derived.#orb = orb;
    return derived;
  }
  static createFromSources<TValue>(
    sources: Atom<unknown>[],
    derive: StaticAsyncDeriveCallback<TValue>
  ): AsyncAtom<TValue> {
    const derived = new AsyncDerivedAtom<any>(
      derive,
      AsyncDerivedAtom.#staticInnerUnwrap
    );
    const orb = createRelayOrb(
      derived,
      AsyncDerivedAtom.#intercept,
      sources.map((atom) => atom[ORB])
    );
    derived.#orb = orb;
    return derived;
  }
}

/**
 * @experimental
 */
export const deriveAsync = AsyncDerivedAtom.create;
