import { EMITTER, type Atom, ORB, type AtomReader } from './atom.js';
import { emptyCacheToken, type EmptyCacheToken } from './cache.js';
import { createEmitter, type Emitter } from './emitter.js';
import { bindableRead, unexpectedRead } from './internal/read.js';
import {
  createRelayOrb,
  Orb,
  type RelayOrb,
  type TransmitterOrb,
} from './orb.js';
import { emptyFn } from './shared.js';

export class DerivedAtom<TValue> implements Atom<TValue> {
  #orb!: RelayOrb<DerivedAtom<TValue>>;
  #emitter?: Emitter;
  #emit = emptyFn;
  #store: TValue | EmptyCacheToken = emptyCacheToken;
  #derive: (read: AtomReader) => TValue;
  #read!: AtomReader;
  private constructor(
    derive: (this: DerivedAtom<TValue>, read: AtomReader) => TValue
  ) {
    this.#derive = derive;
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
  get [ORB](): TransmitterOrb {
    return this.#orb;
  }
  unwrap(): TValue {
    const current = this.#store;
    if (current === emptyCacheToken) {
      return (this.#store = this.#derive(this.#read));
    }
    return current;
  }
  static #intercept(this: Orb<DerivedAtom<any>>) {
    const derived = this.data;
    if (derived.#store === emptyCacheToken) {
      return false;
    }
    derived.#store = emptyCacheToken;
    derived.#emit();
    return true;
  }
  static create<TValue>(
    derive: (this: DerivedAtom<TValue>, read: AtomReader) => TValue
  ): Atom<TValue> {
    const derived = new DerivedAtom(derive);
    const orb = createRelayOrb(derived, DerivedAtom.#intercept);
    derived.#read = bindableRead.bind(orb) as AtomReader;
    derived.#orb = orb;
    return derived;
  }
  static createWithSources<TValue>(
    sources: Atom<any>[],
    derive: (this: DerivedAtom<TValue>, read: AtomReader) => TValue
  ): Atom<TValue> {
    const derived = new DerivedAtom(derive);
    const orb = createRelayOrb(
      derived,
      DerivedAtom.#intercept,
      sources.map((atom) => atom[ORB])
    );
    derived.#read = bindableRead.bind(orb) as AtomReader;
    derived.#orb = orb;
    return derived;
  }
  static createFromSources<TValue>(
    sources: Atom<any>[],
    derive: (this: DerivedAtom<TValue>) => TValue
  ): Atom<TValue> {
    const derived = new DerivedAtom(derive);
    const orb = createRelayOrb(
      derived,
      DerivedAtom.#intercept,
      sources.map((atom) => atom[ORB])
    );
    derived.#read = unexpectedRead;
    derived.#orb = orb;
    return derived;
  }
}

export const derived = DerivedAtom.create;
