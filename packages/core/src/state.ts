import { EMITTER, type Atom, ORB } from './atom.js';
import { createEmitter, type Emitter } from './emitter.js';
import { createTransmitterOrb, type TransmitterOrb } from './orb.js';
import { emptyFn } from './shared.js';

export class StateAtom<T> implements Atom<T> {
  #orb?: TransmitterOrb<void>;
  #transmit: () => void = emptyFn;
  #emitter?: Emitter<void>;
  #emit = emptyFn;
  #store: T;
  private constructor(initialValue: T) {
    this.#store = initialValue;
  }
  #set(value: T): void {
    if (value === this.#store) {
      return;
    }
    this.#store = value;
    this.#emit();
    this.#transmit();
  }
  get [EMITTER](): Emitter<void> {
    const existingEmitter = this.#emitter;
    if (existingEmitter !== undefined) {
      return existingEmitter;
    }

    const { emitter, emit } = createEmitter();

    this.#emitter = emitter;
    this.#emit = emit;

    return emitter;
  }
  get [ORB](): TransmitterOrb<unknown> {
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
  static create<T>(initialValue: T): [StateAtom<T>, (value: T) => void] {
    const ref = new StateAtom(initialValue);
    // TODO: bench perf of set static vs instance
    return [ref, ref.#set.bind(ref)];
  }
}

export const state = StateAtom.create;
