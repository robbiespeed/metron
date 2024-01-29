import type { TransmitterOrb } from 'metron-core/orb.js';
import type { AtomArray } from '../array.js';
import type { Stabilizer } from '../stabilizer.js';
import {
  ARRAY_CHANGE_STORE,
  type ReadonlyArrayChangeStore,
} from './change-store.js';
import type { Emitter } from 'metron-core/emitter.js';
import { EMITTER, ORB } from 'metron-core/atom.js';

export class StabilizedAtomArray<TValue> implements AtomArray<TValue> {
  #inner: TValue[];
  #stabilizer: Stabilizer;
  #orb: TransmitterOrb;
  #changeStore: ReadonlyArrayChangeStore;
  constructor(
    inner: TValue[],
    stabilizer: Stabilizer,
    orb: TransmitterOrb,
    changeStore: ReadonlyArrayChangeStore
  ) {
    this.#inner = inner;
    this.#stabilizer = stabilizer;
    this.#orb = orb;
    this.#changeStore = changeStore;
  }
  get [ORB](): TransmitterOrb {
    return this.#orb;
  }
  get [EMITTER](): Emitter {
    return this.#stabilizer.emitter;
  }
  get [ARRAY_CHANGE_STORE](): ReadonlyArrayChangeStore {
    return this.#changeStore;
  }
  unwrap(): readonly TValue[] {
    this.#stabilizer.stabilize();
    return this.#inner;
  }
}
