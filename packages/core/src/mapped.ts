import { EMITTER, ORB, type Atom } from './atom.js';

export class MappedAtom<T, U> implements Atom<U> {
  #input: Atom<T>;
  #mapper: (inputValue: T) => U;
  private constructor(input: Atom<T>, mapper: (inputValue: T) => U) {
    this.#input = input;
    this.#mapper = mapper;
  }
  get [EMITTER]() {
    return this.#input[EMITTER];
  }
  get [ORB]() {
    return this.#input[ORB];
  }
  unwrap(): U {
    return this.#mapper(this.#input.unwrap());
  }
  static create<T, U>(input: Atom<T>, mapper: (inputValue: T) => U) {
    return new MappedAtom(input, mapper);
  }
}

export const mapped = MappedAtom.create;
