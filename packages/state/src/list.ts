import {
  ValueParticle,
  createSensor,
  emitterKey,
  valueOfKey,
} from '@metron/core';
import { filterEmitter } from './filter-emitter.js';

export enum AtomListChangeType {
  Index,
  Range,
  All,
}

interface AtomListChangeSingle {
  readonly type: AtomListChangeType.Index;
  readonly index: number;
  readonly sizeChanged: boolean;
}

interface AtomListChangeMany {
  readonly type: AtomListChangeType.Range;
  readonly start: number;
  readonly end: number;
  readonly sizeChanged: boolean;
}

interface AtomListChangeAll {
  readonly type: AtomListChangeType.All;
  readonly oldSize: number;
  readonly sizeChanged: boolean;
}

export type AtomListChange =
  | AtomListChangeSingle
  | AtomListChangeMany
  | AtomListChangeAll;

export interface AtomList<T>
  extends ValueParticle<RawAtomList<T>, AtomListChange> {
  readonly size: ValueParticle<number>;
  readonly untracked: RawAtomList<T>;
  // TODO: Evaluate whether to implement `at`
  // at(index: number): ValueParticle<T | undefined>;
  get(index: number): ValueParticle<T | undefined>;
  // TODO: Evaluate whether to implement `indexOf` and `lastIndexOf`
  // indexOf(value: T, fromIndex?: number): ValueParticle<number>;
  // lastIndexOf(value: T, fromIndex?: number): ValueParticle<number>;
  // TODO: Evaluate whether to implement `entries`, `keys`, and `values`
  // Unlikely needed since the raw list can account for their use cases
  // entries(): ValueParticle<IterableIterator<[number, T]>>;
  // keys(): ValueParticle<IterableIterator<number>>;
  // values(): ValueParticle<IterableIterator<T>>;
}

export interface RawAtomList<T> {
  readonly size: number;
  at(index: number): T | undefined;
  get(index: number): T | undefined;
  indexOf(value: T, fromIndex?: number): number;
  lastIndexOf(value: T, fromIndex?: number): number;
  entries(): IterableIterator<[number, T]>;
  keys(): IterableIterator<number>;
  values(): IterableIterator<T>;
}

export interface AtomListWriter<T> {
  set(index: number, value: T): T;
  push(value: T): void;
  append(...values: T[]): void;
  insert(index: number, item: T): void;
  splice(start: number, deleteCount: number, items?: T[]): T[];
  pop(): T | undefined;
  replace(...values: T[]): void;
  clear(): void;
}

const GET_INDEX_OUT_OF_BOUNDS_MESSAGE =
  'Index out of bounds, must be an integer above or equal to 0';
const SET_INDEX_OUT_OF_BOUNDS_MESSAGE =
  'Index out of bounds, must be an integer between 0 and size';

export function createAtomList<T>(
  ...values: T[]
): [list: AtomList<T>, listUpdater: AtomListWriter<T>] {
  let innerValues = values;

  function normalizeGetIndex(index: number) {
    if (index < 0) {
      throw new Error(GET_INDEX_OUT_OF_BOUNDS_MESSAGE);
    }
    return Math.trunc(index);
  }

  const rawList: RawAtomList<T> = {
    get size() {
      return innerValues.length;
    },
    at(index) {
      return innerValues.at(index);
    },
    get(index) {
      return innerValues[normalizeGetIndex(index)];
    },
    indexOf(value, fromIndex) {
      return innerValues.indexOf(value, fromIndex);
    },
    lastIndexOf(value, fromIndex) {
      return innerValues.lastIndexOf(value, fromIndex);
    },
    entries() {
      return innerValues.entries();
    },
    keys() {
      return innerValues.keys();
    },
    values() {
      return innerValues.values();
    },
  };

  const { emitter, send } = createSensor<AtomListChange>();

  // TODO: Abstract this into a reusable function that can be used for
  // creating keyed particles for AtomMap and AtomSet.
  const weakParticles = new Map<
    number,
    WeakRef<ValueParticle<T | undefined>>
  >();

  const finalizationRegistry = new FinalizationRegistry((index: number) => {
    weakParticles.delete(index);
  });

  function getKeyedParticle(index: number) {
    const weakParticle = weakParticles.get(index);
    let particle: ValueParticle<T | undefined> | undefined;
    if (weakParticle) {
      particle = weakParticle.deref();
    }

    if (!particle) {
      particle = {
        [valueOfKey]() {
          return rawList.get(index);
        },
        [emitterKey]: filterEmitter(emitter, (change) => {
          switch (change.type) {
            case AtomListChangeType.Index:
              return change.index === index;
            case AtomListChangeType.Range:
              return change.start <= index && index <= change.end;
            case AtomListChangeType.All:
              return true;
            default:
              return false;
          }
        }),
      };
      const freshWeakParticle = new WeakRef(particle);

      finalizationRegistry.register(particle, index);

      weakParticles.set(index, freshWeakParticle);
    }

    return particle;
  }

  const sizeParticle: ValueParticle<number> = {
    [valueOfKey]() {
      return rawList.size;
    },
    [emitterKey]: filterEmitter(emitter, (change) => {
      switch (change.type) {
        case AtomListChangeType.Index:
          return change.sizeChanged;
        case AtomListChangeType.Range:
          return change.sizeChanged;
        case AtomListChangeType.All:
          return change.sizeChanged;
        default:
          return false;
      }
    }),
  };

  const list: AtomList<T> = {
    get size() {
      return sizeParticle;
    },
    get untracked() {
      return rawList;
    },
    get(index) {
      return getKeyedParticle(normalizeGetIndex(index));
    },
    [valueOfKey]() {
      return rawList;
    },
    [emitterKey]: emitter,
  };

  const listUpdater: AtomListWriter<T> = {
    set(index, value) {
      if (value !== innerValues[index]) {
        const oldSize = innerValues.length;
        if (index > oldSize) {
          throw new Error(SET_INDEX_OUT_OF_BOUNDS_MESSAGE);
        }

        innerValues[index] = value;

        const newSize = innerValues.length;

        send({
          type: AtomListChangeType.Index,
          index: index,
          sizeChanged: oldSize !== newSize,
        });
      }
      return value;
    },
    push(value) {
      innerValues.push(value);
      send({
        type: AtomListChangeType.Index,
        index: innerValues.length - 1,
        sizeChanged: true,
      });
    },
    append(...values) {
      const start = innerValues.length;
      innerValues.push(...values);
      send({
        type: AtomListChangeType.Range,
        start,
        end: innerValues.length - 1,
        sizeChanged: true,
      });
    },
    insert(index, item) {
      const end = innerValues.length;
      if (index === end) {
        return this.push(item);
      }

      innerValues.splice(index, 0, item);

      send({
        type: AtomListChangeType.Range,
        start: index,
        end,
        sizeChanged: true,
      });
    },
    splice(start, deleteCount, items = []) {
      const oldSize = innerValues.length;
      const deletedItems = innerValues.splice(start, deleteCount, ...items);
      const end = innerValues.length;
      send({
        type: AtomListChangeType.Range,
        start,
        end,
        sizeChanged: oldSize !== end,
      });
      return deletedItems;
    },
    pop() {
      const oldSize = innerValues.length;
      const deletedItem = innerValues.pop();

      send({
        type: AtomListChangeType.Index,
        index: innerValues.length,
        sizeChanged: oldSize !== innerValues.length,
      });

      return deletedItem;
    },
    replace(...values) {
      const oldSize = innerValues.length;
      innerValues = values;
      send({
        type: AtomListChangeType.All,
        oldSize,
        sizeChanged: oldSize !== innerValues.length,
      });
    },
    clear() {
      const oldSize = innerValues.length;
      if (oldSize === 0) {
        return;
      }
      innerValues = [];
      send({
        type: AtomListChangeType.All,
        oldSize,
        sizeChanged: true,
      });
    },
  };

  return [list, listUpdater];
}
