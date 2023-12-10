import { createEmitter, type Emitter } from 'metron-core/emitter.js';
import type { Orb } from '../orb.js';
import { emptyFn } from 'metron-core/shared.js';

export class Stabilizer {
  #isStable = false;
  #hook: () => void;
  #emitter?: Emitter;
  #emit = emptyFn;
  constructor(hook: () => void) {
    this.#hook = hook;
  }
  get isStable(): boolean {
    return this.#isStable;
  }
  stabilize(): void {
    if (this.#isStable) {
      return;
    }
    this.#hook();
    this.#isStable = true;
  }
  destabilize(): void {
    this.#isStable = false;
  }
  get emitter(): Emitter {
    const existingEmitter = this.#emitter;
    if (existingEmitter !== undefined) {
      return existingEmitter;
    }

    const { emitter, emit } = createEmitter();

    this.#emitter = emitter;
    this.#emit = emit;

    return emitter;
  }
  static intercept(this: Orb<Stabilizer>) {
    const stabilizer = this.data;
    if (stabilizer.isStable) {
      stabilizer.destabilize();
      stabilizer.#emit();
      return true;
    }

    return false;
  }
}