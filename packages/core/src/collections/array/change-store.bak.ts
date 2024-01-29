export const HINT_FRESH = 0;
export const HINT_UNKNOWN = 1;
export const HINT_CLEAR = 2;
export const HINT_SET = 3;
export const HINT_INSERT = 4;
export const HINT_DELETE = 5;
export const HINT_SPLICE = 6;
export const HINT_MOVE_FORWARD = 7;
export const HINT_MOVE_BACK = 8;
export const HINT_SWAP = 9;

export interface SpacialChange {
  start: number;
  addCount: number;
  deleteCount: number;
}

export const ARRAY_CHANGE_STORE = Symbol('Array Change Store');

export type ReadonlyArrayChangeStore = Pick<
  ArrayChangeStore,
  'changes' | 'checkConnection' | 'nextConnectionToken'
>;

export type ArrayChangeResult = {
  readonly hint: number;
  readonly indexes: readonly number[];
  readonly spacial: readonly SpacialChange[];
};

export class ArrayChangeStore {
  #hint: number = HINT_FRESH;
  #changes?: ArrayChangeResult;
  #indexChanges: number[] = [];
  #spacialChanges: SpacialChange[] = [];
  #nextConnectionToken?: symbol;
  #connectionToken?: symbol;
  #clearState(): void {
    this.#hint = HINT_FRESH;
    this.#indexChanges = [];
    this.#spacialChanges = [];
    this.#changes = undefined;
    this.#connectionToken = undefined;
    this.#nextConnectionToken = undefined;
  }
  #check(nextHint: number): boolean {
    const nextToken = this.#nextConnectionToken;
    if (nextToken !== undefined) {
      this.#connectionToken = nextToken;
      this.#nextConnectionToken = undefined;
    }
    if (this.#connectionToken === undefined) {
      return false;
    }
    const prevHint = this.#hint;
    if (prevHint === HINT_FRESH) {
      this.#hint = nextHint;
    } else if (prevHint === HINT_CLEAR) {
      this.#clearState();
      return false;
    } else {
      this.#hint = HINT_UNKNOWN;
    }
    return true;
  }
  #pushSpacialChange(spacialChange: SpacialChange): void {
    this.#spacialChanges.push(spacialChange);

    const indexChanges = this.#indexChanges;
    if (indexChanges.length === 0) {
      return;
    }

    const spacialDelta = spacialChange.addCount - spacialChange.deleteCount;
    if (spacialDelta === 0) {
      return;
    }

    const spacialStart = spacialChange.start;
    const iEnd = indexChanges.length;

    if (spacialDelta > 0) {
      for (let i = 0; i < iEnd; i++) {
        const changeIndex = indexChanges[i]!;

        if (changeIndex >= spacialStart) {
          indexChanges[i] = changeIndex + spacialDelta;
        }
      }
    } else {
      const spacialEnd = spacialStart - spacialDelta;
      for (let i = 0; i < iEnd; i++) {
        const changeIndex = indexChanges[i]!;

        if (changeIndex >= spacialStart) {
          if (changeIndex < spacialEnd) {
            indexChanges[i] = -1;
          } else {
            indexChanges[i] = changeIndex + spacialDelta;
          }
        }
      }
    }
  }
  set(index: number): void {
    if (this.#check(HINT_SET)) {
      this.#indexChanges.push(index);
    }
  }
  clear(): void {
    const nextToken = this.#nextConnectionToken;
    if (nextToken !== undefined) {
      this.#connectionToken = nextToken;
      this.#nextConnectionToken = undefined;
    }
    if (this.#connectionToken === undefined) {
      return;
    }

    const prevHint = this.#hint;
    if (prevHint === HINT_CLEAR) {
      return;
    }
    if (prevHint !== HINT_FRESH) {
      this.#clearState();
      return;
    }
    this.#hint = HINT_CLEAR;
  }
  replace(): void {
    const nextToken = this.#nextConnectionToken;
    if (nextToken !== undefined) {
      this.#connectionToken = nextToken;
      this.#nextConnectionToken = undefined;
    }
    if (this.#connectionToken === undefined) {
      return;
    }

    this.#clearState();
  }
  insert(index: number): void {
    if (this.#check(HINT_INSERT)) {
      this.#pushSpacialChange({ start: index, addCount: 1, deleteCount: 0 });
    }
  }
  delete(index: number): void {
    if (this.#check(HINT_DELETE)) {
      this.#pushSpacialChange({ start: index, addCount: 0, deleteCount: 1 });
    }
  }
  moveBack(from: number, to: number, count: number): void {
    if (this.#check(HINT_MOVE_BACK)) {
      this.#spacialChanges.push(
        { start: from, addCount: 0, deleteCount: count },
        { start: to, addCount: count, deleteCount: 0 }
      );

      const indexChanges = this.#indexChanges;
      if (indexChanges.length === 0) {
        return;
      }

      const moveDelta = from - to;
      const moveEnd = from + count;

      const iEnd = indexChanges.length;
      for (let i = 0; i < iEnd; i++) {
        const changeIndex = indexChanges[i]!;

        if (changeIndex >= to) {
          if (changeIndex < from) {
            indexChanges[i] = changeIndex + count;
          } else if (changeIndex < moveEnd) {
            indexChanges[i] = changeIndex - moveDelta;
          }
        }
      }
    }
  }
  moveForward(from: number, to: number, count: number): void {
    if (this.#check(HINT_MOVE_FORWARD)) {
      this.#spacialChanges.push(
        { start: from, addCount: 0, deleteCount: count },
        {
          start: to - count,
          addCount: count,
          deleteCount: 0,
        }
      );

      const indexChanges = this.#indexChanges;
      if (indexChanges.length === 0) {
        return;
      }

      const moveDelta = from - to;
      const moveEnd = from + count;

      const iEnd = indexChanges.length;
      for (let i = 0; i < iEnd; i++) {
        const changeIndex = indexChanges[i]!;

        if (changeIndex >= from) {
          if (changeIndex < moveEnd) {
            indexChanges[i] = changeIndex + moveDelta;
          } else if (changeIndex < to) {
            indexChanges[i] = changeIndex - count;
          }
        }
      }
    }
  }
  splice(start: number, addCount: number, deleteCount: number): void {
    if (this.#check(HINT_SPLICE)) {
      this.#pushSpacialChange({ start, addCount, deleteCount });
    }
  }
  swap(a: number, b: number): void {
    if (this.#check(HINT_SWAP)) {
      this.#indexChanges.push(a, b);
    }
  }
  checkConnection(token: symbol): boolean {
    return token === this.#connectionToken;
  }
  get nextConnectionToken(): symbol {
    return (this.#nextConnectionToken ??= Symbol());
  }
  get changes(): ArrayChangeResult {
    const existingChanges = this.#changes;
    if (existingChanges !== undefined) {
      return existingChanges;
    }

    const hint = this.#hint;
    const spacial = this.#spacialChanges;
    let indexes = this.#indexChanges;

    if (hint === HINT_UNKNOWN) {
      const indexSet = new Set(this.#indexChanges);
      indexSet.delete(-1);
      indexes = [...indexSet];
    }

    return (this.#changes = { hint, indexes, spacial });
  }
}
