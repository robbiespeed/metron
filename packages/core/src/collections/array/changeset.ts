export const HINT_FRESH = 0;
export const HINT_CLEAR = 1;
export const HINT_UNKNOWN = 2;
export const HINT_SET = 3;
export const HINT_INSERT = 4;
export const HINT_DELETE = 5;
export const HINT_MOVE = 6;
export const HINT_SPLICE = 7;
export const HINT_SWAP = 8;

export const ARRAY_CHANGESET_CREATE_CONNECTOR = Symbol(
  'Array Changeset Create Connector'
);

export interface SpacialChange {
  start: number;
  addCount: number;
  deleteCount: number;
}

export interface ArrayChangesetConnector {
  renewConnection(): void;
  isConnected(): boolean;
  getChanges(): ReadonlyChangeArray;
  getHint(): number;
}

type ReadonlyChangeArray = readonly (number | Readonly<SpacialChange>)[];

export class ArrayChangeset {
  #changes: (number | SpacialChange)[] = [];
  #hint = HINT_FRESH;
  #nextConnectionToken?: symbol;
  #connectionToken?: symbol;
  #maxComplexity: number;
  constructor(maxComplexity: number) {
    this.#maxComplexity = maxComplexity;
  }
  #clearState() {
    this.#hint = HINT_FRESH;
    this.#changes.length = 0;
    this.#connectionToken = undefined;
    this.#nextConnectionToken = undefined;
  }
  #setHint(hint: number): boolean {
    if (this.#changes.length >= this.#maxComplexity) {
      this.#clearState();
      return false;
    }
    const prevHint = this.#hint;
    if (prevHint === HINT_FRESH) {
      this.#hint = hint;
    } else if (prevHint === HINT_CLEAR) {
      this.#clearState();
      return false;
    } else {
      this.#hint = HINT_UNKNOWN;
    }
    return true;
  }
  set(index: number): void {
    if (this.#setHint(HINT_SET)) {
      this.#changes.push(index);
    }
  }
  clear(): void {
    this.#hint = HINT_CLEAR;
    this.#changes.length = 0;
  }
  replace(): void {
    this.#clearState();
  }
  insert(index: number): void {
    if (this.#setHint(HINT_INSERT)) {
      this.#changes.push({ start: index, addCount: 1, deleteCount: 0 });
    }
  }
  delete(index: number): void {
    if (this.#setHint(HINT_DELETE)) {
      this.#changes.push({ start: index, addCount: 0, deleteCount: 1 });
    }
  }
  move(from: number, to: number, count: number) {
    if (this.#setHint(HINT_MOVE)) {
      this.#changes.push(
        { start: from, addCount: 0, deleteCount: count },
        { start: to, addCount: count, deleteCount: 0 }
      );
    }
  }
  splice(start: number, addCount: number, deleteCount: number) {
    if (this.#setHint(HINT_SPLICE)) {
      this.#changes.push({ start, addCount, deleteCount });
    }
  }
  swap(a: number, b: number) {
    if (this.#setHint(HINT_SWAP)) {
      this.#changes.push(a, b);
    }
  }
  static bindableGetConnected(
    this: ArrayChangeset
  ): ArrayChangeset | undefined {
    if (this.#nextConnectionToken !== undefined) {
      this.#connectionToken = this.#nextConnectionToken;
      this.#nextConnectionToken = undefined;
    }
    return this.#connectionToken !== undefined ? this : undefined;
  }
  static Connector = class ArrayChangesetConnector {
    #source: ArrayChangeset;
    #consumerToken: symbol;
    constructor(source: ArrayChangeset) {
      this.#source = source;
      if (source.#nextConnectionToken === undefined) {
        source.#nextConnectionToken = Symbol();
      }
      this.#consumerToken = source.#nextConnectionToken;
    }
    renewConnection(): void {
      const source = this.#source;
      if (source.#nextConnectionToken === undefined) {
        source.#nextConnectionToken = Symbol();
      }
      this.#consumerToken = source.#nextConnectionToken;
    }
    isConnected(): boolean {
      return this.#consumerToken === this.#source.#connectionToken;
    }
    getChanges(): ReadonlyChangeArray {
      return this.#source.#changes;
    }
    getHint(): number {
      return this.#source.#hint;
    }
    static bindableCreateConnector(
      this: ArrayChangeset
    ): ArrayChangesetConnector {
      return new ArrayChangesetConnector(this);
    }
  };
}

export const ArrayChangesetConnector = ArrayChangeset.Connector;

export const bindableGetConnectedArrayChangeset =
  ArrayChangeset.bindableGetConnected;

export const bindableCreateArrayChangesetConnector =
  ArrayChangeset.Connector.bindableCreateConnector;
