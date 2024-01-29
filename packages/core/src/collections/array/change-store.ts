export const HINT_NONE = 0;
export const HINT_SET = 1;
export const HINT_INSERT = 2;
export const HINT_DELETE = 3;
export const HINT_PUSH = 4;
export const HINT_SPLICE = 5;
export const HINT_MOVE_RIGHT = 6;
export const HINT_MOVE_LEFT = 7;
export const HINT_SWAP = 8;

export interface ArrayChange {
  readonly hint: number;
  readonly start: number;
  readonly data: unknown;
}
export interface ArrayChangeBasic extends ArrayChange {
  readonly hint: typeof HINT_NONE;
  readonly data: undefined;
}
export interface ArrayChangeIndex extends ArrayChange {
  readonly hint: typeof HINT_SET | typeof HINT_INSERT | typeof HINT_DELETE;
  readonly data: undefined;
}
export interface ArrayChangeMove extends ArrayChange {
  readonly hint: typeof HINT_MOVE_RIGHT | typeof HINT_MOVE_LEFT;
  readonly data: {
    readonly count: number;
    readonly from: number;
    readonly to: number;
  };
}
export interface ArrayChangePush extends ArrayChange {
  readonly hint: typeof HINT_PUSH;
  readonly data: number;
}
export interface ArrayChangeSwap extends ArrayChange {
  readonly hint: typeof HINT_SWAP;
  readonly data: number;
}
export interface ArrayChangeSplice extends ArrayChange {
  readonly hint: typeof HINT_SPLICE;
  readonly data: {
    readonly addCount: number;
    readonly deleteCount: number;
  };
}

export type ArrayChangeUnion =
  | ArrayChangeBasic
  | ArrayChangeIndex
  | ArrayChangeMove
  | ArrayChangePush
  | ArrayChangeSwap
  | ArrayChangeSplice;

type WritableArrayChange = {
  -readonly [K in keyof ArrayChange]: ArrayChange[K];
};

export const ARRAY_CHANGE_STORE = Symbol('Array Change Store');

export type ReadonlyArrayChangeStore = Pick<
  ArrayChangeStore,
  'get' | 'nextConnectionToken'
>;

export class ArrayChangeStore {
  #change: undefined | ArrayChangeUnion = undefined;
  #nextConnectionToken?: symbol;
  #connectionToken?: symbol;
  #clearState() {
    this.#change = undefined;
    this.#connectionToken = undefined;
    this.#nextConnectionToken = undefined;
  }
  #commit(changeStart: number): boolean {
    const nextToken = this.#nextConnectionToken;
    if (nextToken !== undefined) {
      this.#change = undefined;
      this.#connectionToken = nextToken;
      this.#nextConnectionToken = undefined;
    }
    if (this.#connectionToken === undefined) {
      return false;
    }
    const existingChange: WritableArrayChange | undefined = this.#change;
    if (existingChange === undefined) {
      return true;
    }
    existingChange.hint = HINT_NONE;
    existingChange.data = undefined;
    if (changeStart < existingChange.start) {
      existingChange.start = changeStart;
    }
    return false;
  }
  index(
    hint: typeof HINT_SET | typeof HINT_INSERT | typeof HINT_DELETE,
    index: number
  ): undefined {
    if (this.#commit(index)) {
      this.#change = { hint, start: index, data: undefined };
    }
  }
  clear(): undefined {
    this.#clearState();
  }
  moveRight(from: number, to: number, count: number): undefined {
    if (this.#commit(from)) {
      this.#change = {
        hint: HINT_MOVE_RIGHT,
        start: from,
        data: { count, from, to },
      };
    }
  }
  moveLeft(from: number, to: number, count: number): undefined {
    if (this.#commit(to)) {
      this.#change = {
        hint: HINT_MOVE_LEFT,
        start: to,
        data: { count, from, to },
      };
    }
  }
  push(start: number, count: number): undefined {
    if (this.#commit(start)) {
      this.#change = { hint: HINT_PUSH, start, data: count };
    }
  }
  splice(start: number, addCount: number, deleteCount: number): undefined {
    if (this.#commit(start)) {
      this.#change = {
        hint: HINT_SPLICE,
        start,
        data: { addCount, deleteCount },
      };
    }
  }
  swap(a: number, b: number): undefined {
    if (this.#commit(a)) {
      this.#change = { hint: HINT_SWAP, start: a, data: b };
    }
  }
  get nextConnectionToken(): symbol {
    return (this.#nextConnectionToken ??= Symbol());
  }
  get(token: symbol): undefined | ArrayChangeUnion {
    return token === this.#connectionToken ? this.#change : undefined;
  }
}
