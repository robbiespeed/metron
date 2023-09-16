import { signalKey, toValueKey, type Atom } from './particle.js';
import { SignalNode } from './signal-node.js';

export interface AtomSetter<T> {
  (value: T): T;
}

export type { Atom };

class Signal<T> implements Atom<T> {
  private node = new SignalNode(this);
  readonly [signalKey] = this.node as SignalNode;
  private store: T;
  private constructor(init: T) {
    this.node.initAsSource();
    this.store = init;
  }
  [toValueKey]() {
    return this.store;
  }
  static create<T>(init: T): [Atom<T>, (value: T) => T] {
    const atom = new Signal(init);

    return [
      atom,
      (value: T) => {
        if (atom.store === value) {
          return value;
        }
        atom.store = value;
        atom.node.update();

        return value;
      },
    ];
  }
  static createWithMutator<T>(
    init: T
  ): [Atom<T>, (mutate: (oldValue: T) => T) => T] {
    const atom = new Signal(init);

    return [
      atom,
      (mutate: (oldValue: T) => T) => {
        const storeValue = atom.store;
        const value = mutate(storeValue);
        if (storeValue === value) {
          return value;
        }
        atom.store = value;
        atom.node.update();

        return value;
      },
    ];
  }
}

export const createAtom = Signal.create;

export interface AtomMutator<T> {
  (mutate: (oldValue: T) => T): T;
}

export const createMutatorAtom = Signal.createWithMutator;
