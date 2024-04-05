import { EMITTER, type Atom, ORB, IS_ATOM } from './atom.js';
import { Emitter, createEmitter } from './emitter.js';
import { type Orb, createTransmitterOrb } from './orb.js';
import { emptyFn } from './shared.js';

export class StateAtom<T> implements Atom<T> {
  #orb?: Orb<undefined>;
  #transmit = emptyFn;
  #emitter?: Emitter;
  #emit = emptyFn;
  #store: T;
  private constructor(initialValue: T) {
    this.#store = initialValue;
  }
  #set(value: T): undefined {
    if (value === this.#store) {
      return;
    }
    this.#store = value;
    this.#emit();
    this.#transmit();
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
    const existingNode = this.#orb;
    if (existingNode !== undefined) {
      return existingNode;
    }

    const { orb, transmit } = createTransmitterOrb();
    this.#orb = orb;
    this.#transmit = transmit;

    return orb;
  }
  unwrap(): T {
    return this.#store;
  }
  static create<T>(initialValue: T): [StateAtom<T>, (value: T) => undefined] {
    const ref = new StateAtom(initialValue);
    // TODO: bench perf of set static vs instance
    return [ref, ref.#set.bind(ref)];
  }
}

export const state = StateAtom.create;
