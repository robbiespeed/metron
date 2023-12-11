const HINT_FRESH = 0;
const HINT_CLEAR = 1;
const HINT_UNKNOWN = 2;
const HINT_SET = 3;
const HINT_INSERT = 4;
const HINT_DELETE = 5;
const HINT_MOVE = 6;
const HINT_SPLICE = 7;
const HINT_SWAP = 8;

interface SpacialChange {
  start: number;
  addCount: number;
  deleteCount: number;
}

interface ChangeResponse {
  readonly hint: number;
  readonly spacialChanges: readonly Readonly<SpacialChange>[];
  readonly writes: readonly number[];
}

export class ArrayChangeSet {
  #changes: (number | SpacialChange)[] = [];
  #hasSpacialChanges = false;
  #hint = HINT_FRESH;
  #response?: ChangeResponse;
  #nextConnectionToken?: symbol;
  #connectionToken?: symbol;
  #maxComplexity: number;
  constructor(maxComplexity: number) {
    this.#maxComplexity = maxComplexity;
  }
  connected(): this | undefined {
    if (this.#nextConnectionToken !== undefined) {
      this.#connectionToken = this.#nextConnectionToken;
      this.#nextConnectionToken = undefined;
    }
    return this.#connectionToken !== undefined ? this : undefined;
  }
  #clearState() {
    this.#hint = HINT_FRESH;
    this.#changes.length = 0;
    this.#hasSpacialChanges = false;
    this.#connectionToken = undefined;
    this.#nextConnectionToken = undefined;
    this.#response = undefined;
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
  #compileResponse(): ChangeResponse {
    let response = this.#response;
    if (response !== undefined) {
      return response;
    }

    const hint = this.#hint;
    const changes = this.#changes;
    const changesCount = changes.length;

    if (!this.#hasSpacialChanges) {
      if (hint > HINT_UNKNOWN) {
        response = { hint, spacialChanges: [], writes: changes as number[] };
      } else {
        response = {
          hint,
          spacialChanges: [],
          writes: [...new Set(this.#changes as number[])],
        };
      }
    } else if (changesCount === 1) {
      // Since above check already covers non spacial changes, we know this will be a spacial change.
      response = {
        hint,
        spacialChanges: [changes[0] as SpacialChange],
        writes: [],
      };
    } else if (changesCount === 0) {
      response = { hint, spacialChanges: [], writes: [] };
    }

    if (response !== undefined) {
      this.#response = response;
      return response;
    }

    const spacialChanges: SpacialChange[] = [];
    const writes = new Set<number>();

    for (let i = changesCount - 1; i >= 0; i--) {
      const rightChange = changes[i]!;
      if (typeof rightChange !== 'number') {
        let { start, addCount, deleteCount } = rightChange;
        let deleteEnd = start + deleteCount;
        let deltaCount = addCount - deleteCount;
        for (let j = i - 1; j >= 0; j--) {
          const leftChange = changes[j]!;
          if (typeof leftChange === 'number') {
            if (leftChange >= 0 && leftChange > start) {
              if (leftChange < deleteEnd) {
                changes[j] = -1;
                continue;
              }
              changes[j] = leftChange + deltaCount;
            }
            continue;
          }
          const leftStart = leftChange.start;
          if (leftStart > start && leftStart < deleteEnd) {
            // Have right change consumer left change since they overlap

            const leftAddCount = leftChange.addCount;
            const leftDeleteCount = leftChange.deleteCount;
            rightChange.addCount = addCount = addCount + leftAddCount;
            rightChange.deleteCount = deleteCount =
              deleteCount + leftDeleteCount;
            deleteEnd = start + deleteCount;
            deleteCount = addCount - deleteCount;

            // Since the left change is being consumed by the right,
            // we subtract the changes in between by the left delta
            const leftDelta = leftAddCount - leftDeleteCount;
            for (let k = j + 1; k <= i; k++) {
              const midChange = changes[k]!;
              if (typeof midChange === 'number') {
                if (midChange >= 0 && midChange > leftStart) {
                  changes[k] = midChange - leftDelta;
                }
              } else if (midChange.start > leftStart) {
                midChange.start -= leftDelta;
              }
            }
            changes[j] = -1;
            continue;
          }
        }
        spacialChanges.push(rightChange);
      } else if (rightChange >= 0) {
        writes.add(rightChange);
      }
    }

    spacialChanges.reverse();

    response = { hint: this.#hint, spacialChanges, writes: [...writes] };
    this.#response = response;
    return response;
  }
  set(index: number): void {
    if (this.#setHint(HINT_SET)) {
      this.#changes.push(index);
    }
  }
  clear(): void {
    this.#hint = HINT_CLEAR;
    this.#changes.length = 0;
    this.#hasSpacialChanges = false;
  }
  replace(): void {
    this.#clearState();
  }
  insert(index: number): void {
    if (this.#setHint(HINT_INSERT)) {
      this.#hasSpacialChanges = true;
      this.#changes.push({ start: index, addCount: 1, deleteCount: 0 });
    }
  }
  delete(index: number): void {
    if (this.#setHint(HINT_DELETE)) {
      this.#hasSpacialChanges = true;
      this.#changes.push({ start: index, addCount: 0, deleteCount: 1 });
    }
  }
  move(from: number, to: number, count: number) {
    if (this.#setHint(HINT_MOVE)) {
      this.#hasSpacialChanges = true;
      this.#changes.push(
        { start: from, addCount: 0, deleteCount: count },
        { start: to, addCount: count, deleteCount: 0 }
      );
    }
  }
  splice(start: number, addCount: number, deleteCount: number) {
    if (this.#setHint(HINT_SPLICE)) {
      this.#hasSpacialChanges = true;
      this.#changes.push({ start, addCount, deleteCount });
    }
  }
  swap(a: number, b: number) {
    if (this.#setHint(HINT_SWAP)) {
      this.#changes.push(a, b);
    }
  }
  static ConsumerConnector = class ArrayChangeSetConsumerConnector {
    #source: ArrayChangeSet;
    #consumerToken: symbol;
    constructor(source: ArrayChangeSet) {
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
    getChanges(): ChangeResponse {
      return this.#source.#compileResponse();
    }
  };
}

// Only maintain a single branch out of dater consumers can do a full
