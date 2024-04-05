import { EMITTER, IS_ATOM, ORB, type Atom } from './atom.js';
import { createEmitter, type Emitter } from './emitter.js';
import { map } from './map.js';
import { type Orb, createRelayOrb, linkOrbs } from './orb.js';
import { emptyFn } from './shared.js';

export interface Selector<TIn> {
  select(value: TIn): SelectAtom;
  mapSelect<TOut>(
    value: TIn,
    mapper: (isSelected: boolean) => TOut
  ): Atom<TOut>;
}

class SelectAtom implements Atom<boolean> {
  #value: unknown;
  #input: Atom<unknown>;
  #emitter?: Emitter;
  #emit = emptyFn;
  #orb: Orb<SelectAtom> = createRelayOrb(this, SelectAtom.#intercept);
  #isSelected: number = -1;
  constructor(value: unknown, input: Atom<unknown>) {
    this.#value = value;
    this.#input = input;
  }
  unwrap(): boolean {
    if (this.#isSelected === -1) {
      const isSelected = this.#input.unwrap() === this.#value;
      this.#isSelected = isSelected ? 1 : 0;
      return isSelected;
    }
    return this.#isSelected === 1;
  }
  get [IS_ATOM](): true {
    return true;
  }
  get [ORB](): Orb<SelectAtom> {
    return this.#orb;
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
  static #intercept(this: Orb<SelectAtom>): boolean {
    const { data } = this;
    if (data.#isSelected === -1) {
      return false;
    }
    data.#isSelected = -1;
    data.#emit();
    return true;
  }
  static Selector = class _Selector<TIn> implements Selector<TIn> {
    #input!: Atom<TIn>;
    #store!: TIn;
    #orbs = new Map<TIn, WeakRef<Orb<SelectAtom>>>();
    #createValueAtom(value: TIn): SelectAtom {
      const atom = new SelectAtom(value, this.#input);
      this.#orbs.set(value, atom[ORB].weakRef);
      return atom;
    }
    #getValueAtom(value: TIn): SelectAtom | undefined {
      const orbRef = this.#orbs.get(value);
      if (orbRef === undefined) {
        return;
      }
      const orb = orbRef.deref();
      if (orb !== undefined) {
        return orb.data;
      }

      this.#orbs.delete(value);
      return;
    }
    select(value: TIn): SelectAtom {
      return this.#getValueAtom(value) ?? this.#createValueAtom(value);
    }
    mapSelect<TOut>(
      value: TIn,
      mapper: (isSelected: boolean) => TOut
    ): Atom<TOut> {
      return map(
        this.#getValueAtom(value) ?? this.#createValueAtom(value),
        mapper
      );
    }
    static #intercept(this: Orb<_Selector<unknown>>) {
      const selector = this.data;

      const nextValue = selector.#input.unwrap();

      const prevAtom = selector.#getValueAtom(selector.#store);
      if (prevAtom !== undefined) {
        linkOrbs(prevAtom[ORB], this);
      }
      const nextAtom = selector.#getValueAtom(nextValue);
      if (nextAtom !== undefined) {
        linkOrbs(nextAtom[ORB], this);
      }
      selector.#store = nextValue;

      return true;
    }
    static #relays = new WeakMap<Atom<unknown>, Orb<_Selector<any>>>();
    static create<TIn>(input: Atom<TIn>): Selector<TIn> {
      let relay = _Selector.#relays.get(input);
      if (relay !== undefined) {
        return relay.data;
      }

      const selector = new _Selector();
      selector.#input = input;
      selector.#store = input.unwrap();
      _Selector.#relays.set(
        input,
        createRelayOrb(selector, _Selector.#intercept, [input[ORB]])
      );

      return selector;
    }
  };
}

export const createSelector = SelectAtom.Selector.create;
