// import { ORB, type Atom, IS_ATOM, EMITTER } from './atom.js';
// import { emptyCacheToken, type EmptyCacheToken } from './cache.js';
// import { createEmitter, type Emitter } from './emitter.js';
// import { map } from './map.js';
// import { createRelayOrb, Orb, type RelayOrb } from './orb.js';
// import { emptyFn } from './shared.js';

// export interface ISelector<T> {
//   (match: T): Atom<boolean>;
//   <TOut>(match: T, mapper: (isSelected: boolean) => TOut): Atom<TOut>;
// }

// class SelectAtom implements Atom<boolean> {
//   #parent: Atom<unknown>;
//   #value: unknown;
//   #emitter?: Emitter;
//   #emit = emptyFn;
//   #isSelected: number = -1;
//   #orb = createRelayOrb(this, SelectAtom.#intercept);
//   constructor(value: unknown, parent: Atom<unknown>) {
//     this.#value = value;
//     this.#parent = parent;
//   }
//   unwrap(): boolean {
//     if (this.#isSelected === -1) {
//       this.#isSelected = this.#value === this.#parent.unwrap() ? 1 : 0;
//     }
//     return this.#isSelected === 1;
//   }
//   get [IS_ATOM](): true {
//     return true;
//   }
//   get [ORB](): RelayOrb<SelectAtom> {
//     return this.#orb;
//   }
//   get [EMITTER](): Emitter {
//     const existingEmitter = this.#emitter;
//     if (existingEmitter !== undefined) {
//       return existingEmitter;
//     }

//     const { emitter, emit } = createEmitter();

//     this.#emitter = emitter;
//     this.#emit = emit;

//     return emitter;
//   }
// }

// class Selector<TIn> {
//   #prevValue: TIn | EmptyCacheToken = emptyCacheToken;
//   #input: Atom<TIn>;
//   #orbs = new Map<TIn, WeakRef<Orb<SelectAtom>>>();
//   #finalReg = new FinalizationRegistry<TIn>((key) => {
//     this.#orbs.delete(key);
//   });
//   constructor(input: Atom<TIn>) {
//     this.#input = input;
//   }
//   select(value: TIn): Atom<boolean> {
//     return this.#getValueAtom(value) ?? this.#createValueAtom(value);
//   }
//   mapSelect<TOut>(
//     value: TIn,
//     mapper: (isSelected: boolean) => TOut
//   ): Atom<TOut> {
//     return map(
//       this.#getValueAtom(value) ?? this.#createValueAtom(value),
//       mapper
//     );
//   }
//   #createValueAtom(value: TIn): SelectAtom {
//     const atom = new SelectAtom(value, this.#input);
//     this.#finalReg.register(atom, value);
//     this.#orbs.set(value, atom[ORB].weakRef);
//     return atom;
//   }
//   #getValueAtom(value: TIn): SelectAtom | undefined {
//     const orbRef = this.#orbs.get(value);

//     if (orbRef === undefined) {
//       return;
//     }

//     const orb = orbRef.deref();

//     if (orb !== undefined) {
//       return orb.data;
//     }

//     this.#orbs.delete(value);
//     return;
//   }
//   static #intercept(this: Orb<Selector<unknown>>) {
//     const selector = this.data;
//     const value = selector.#input.unwrap();
//     const nextValue;
//     selector.#getValueAtom(value)?.set(true);
//     selector.#getValueAtom(selector.#prevValue)?.set(false);
//     selector.#prevValue = value;

//     return true;
//   }
//   static create<TIn>(input: Atom<TIn>) {
//     return new Selector<TIn>(input);
//   }
// }

// export type { Selector };
// export const createSelector = Selector.create;
