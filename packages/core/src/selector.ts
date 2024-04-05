import { ORB, type Atom, IS_ATOM, EMITTER } from './atom.js';
import { emptyCacheToken, type EmptyCacheToken } from './cache.js';
import { createEmitter, type Emitter } from './emitter.js';
import { createRelayOrb, createTransmitterOrb, type Orb } from './orb.js';
import { emptyFn } from './shared.js';

export interface ISelector<T> {
  (match: T): Atom<boolean>;
  <TOut>(match: T, mapper: (isSelected: boolean) => TOut): Atom<TOut>;
}

class SelectSubAtom {
  #orb?: Orb<undefined>;
  #transmit = emptyFn;
  #emitter?: Emitter;
  #emit = emptyFn;
  #isSelected: boolean;
  parentOrb: Orb<unknown>;
  constructor(isSelected: boolean, parentOrb: Orb<unknown>) {
    this.parentOrb = parentOrb;
    this.#isSelected = isSelected;
  }
  set(isSelected: boolean): undefined {
    if (isSelected === this.#isSelected) {
      return;
    }
    this.#isSelected = isSelected;
    this.#emit();
    this.#transmit();
  }
  getIsSelected(): boolean {
    return this.#isSelected;
  }
  getOrb(): Orb {
    const existingNode = this.#orb;
    if (existingNode !== undefined) {
      return existingNode;
    }

    const { orb, transmit } = createTransmitterOrb();
    this.#orb = orb;
    this.#transmit = transmit;

    return orb;
  }
  getEmitter(): Emitter {
    const existingEmitter = this.#emitter;
    if (existingEmitter !== undefined) {
      return existingEmitter;
    }

    const { emitter, emit } = createEmitter();

    this.#emitter = emitter;
    this.#emit = emit;

    return emitter;
  }
}

class SelectAtom implements Atom<boolean> {
  #subAtom: SelectSubAtom;
  constructor(subAtom: SelectSubAtom) {
    this.#subAtom = subAtom;
  }
  get [IS_ATOM](): true {
    return true;
  }
  get [EMITTER]() {
    return this.#subAtom.getEmitter();
  }
  get [ORB]() {
    return this.#subAtom.getOrb();
  }
  unwrap(): boolean {
    return this.#subAtom.getIsSelected();
  }
}

class MapSelectAtom<T> implements Atom<T> {
  #prevIsSelected: boolean;
  #store: T | EmptyCacheToken = emptyCacheToken;
  #subAtom: SelectSubAtom;
  #mapper: (isSelected: boolean) => T;
  constructor(subAtom: SelectSubAtom, mapper: (isSelected: boolean) => T) {
    this.#subAtom = subAtom;
    this.#prevIsSelected = subAtom.getIsSelected();
    this.#mapper = mapper;
  }
  get [IS_ATOM](): true {
    return true;
  }
  get [EMITTER]() {
    return this.#subAtom.getEmitter();
  }
  get [ORB]() {
    return this.#subAtom.getOrb();
  }
  unwrap(): T {
    const isSelected = this.#subAtom.getIsSelected();
    if (
      this.#store === emptyCacheToken ||
      isSelected !== this.#prevIsSelected
    ) {
      this.#prevIsSelected = isSelected;
      return (this.#store = this.#mapper(isSelected));
    }
    return this.#store;
  }
}

class Selector<TIn> {
  #prevValue: TIn | EmptyCacheToken = emptyCacheToken;
  #input: Atom<TIn>;
  #orb: Orb<this>;
  #subAtoms = new Map<TIn, WeakRef<SelectSubAtom>>();
  #finalReg = new FinalizationRegistry<TIn>((key) => {
    this.#subAtoms.delete(key);
  });
  constructor(input: Atom<TIn>) {
    this.#input = input;
    const orb = createRelayOrb(this, Selector.#intercept, [input[ORB]]);
    this.#orb = orb;
  }
  select(value: TIn): Atom<boolean> {
    return new SelectAtom(
      this.#getSubAtom(value) ?? this.#createSubAtom(value)
    );
  }
  mapSelect<TOut>(
    value: TIn,
    mapper: (isSelected: boolean) => TOut
  ): Atom<TOut> {
    return new MapSelectAtom(
      this.#getSubAtom(value) ?? this.#createSubAtom(value),
      mapper
    );
  }
  #createSubAtom(value: TIn): SelectSubAtom {
    const subAtom = new SelectSubAtom(
      this.#input.unwrap() === value,
      this.#orb
    );
    const ref = new WeakRef(subAtom);
    this.#finalReg.register(subAtom, value);
    this.#subAtoms.set(value, ref);
    return subAtom;
  }
  #getSubAtom(value: TIn): SelectSubAtom | undefined {
    const subAtomRef = this.#subAtoms.get(value);

    if (subAtomRef === undefined) {
      return;
    }

    const subAtom = subAtomRef.deref();

    if (subAtom !== undefined) {
      return subAtom;
    }

    this.#subAtoms.delete(value);
    return;
  }
  static #intercept(this: Orb<Selector<unknown>>) {
    const selector = this.data;
    const value = selector.#input.unwrap();
    selector.#getSubAtom(value)?.set(true);
    selector.#getSubAtom(selector.#prevValue)?.set(false);
    selector.#prevValue = value;

    return true;
  }
  static create<TIn>(input: Atom<TIn>) {
    return new Selector<TIn>(input);
  }
}

export type { Selector };
export const createSelector = Selector.create;
