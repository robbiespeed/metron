import { ListChange, ListChangeType, ParticleList } from '../list';
import { OrbConnector } from '../orb';
import { createSensor } from '../sensor';
import { Emitter } from '../types';
import { Computer, createComputer } from '.';

export interface ComputerList <T> {
  readonly size: number;
  get (index: number): T | undefined;
  watch: Emitter<ListChange>;
  entries (): IterableIterator<[number, T]>;
  values (): IterableIterator<T>;
  [Symbol.iterator](): IterableIterator<T>;
}

// BROKEN
// TODO:
// Computer list needs a base orb and all sub computers need to depend on it.
// Or don't use multiple computers for items, and use only one main orb instead
export function createComputerList <T, U> (
  list: ParticleList<U>,
  getItem: (item: U, connect: OrbConnector) => T
): ComputerList<T> {
  const { watch, send } = createSensor<ListChange>();

  const computerMap: Map<U, Computer<T>> = new Map();
  const countMap: Map<U, number> = new Map();
  let baseItems: (U | undefined)[] = [...list];

  for (const item of list.values()) {
    countMap.set(item, (countMap.get(item) ?? 0) + 1);
  }

  const updateOldAtIndex = (index: number) => {
    const oldBaseItem = baseItems[index]!;

    const oldBICount = countMap.get(oldBaseItem)!;

    if (oldBICount > 1) {
      countMap.set(oldBaseItem, oldBICount - 1);
    }
    else {
      countMap.delete(oldBaseItem);
      computerMap.delete(oldBaseItem);
    }
  };

  const updateNewAtIndex = (index: number) => {
    const newBaseItem = list.get(index)!;
    baseItems[index] = newBaseItem;
    countMap.set(newBaseItem, (countMap.get(newBaseItem) ?? 0) + 1);
  };

  list.watch((data) => {
    switch (data.t) {
      case ListChangeType.Set: {
        const { i } = data;
        if (i < baseItems.length) {
          updateOldAtIndex(i);
        }
        updateNewAtIndex(i);
        break;
      }
      case ListChangeType.Push: {
        const { i } = data;
        updateNewAtIndex(i);
        break;
      }
      case ListChangeType.Pop: {
        const { i } = data;

        updateOldAtIndex(i);
        baseItems[i] = undefined;
        break;
      }
      case ListChangeType.Append: {
        const { s, e } = data;
        let i = s;
        while (i <= e) {
          updateNewAtIndex(i);
          i++;
        }
        break;
      }
      case ListChangeType.Clear: {
        countMap.clear();
        computerMap.clear();
        baseItems = [];
        break;
      }
    }
    send(data);
  });

  const get = (index: number) => {
    if (index > list.size) {
      return;
    }
    const baseItem = baseItems[index]!;
    let computer = computerMap.get(baseItem);
    if (!computer) {
      computer = createComputer((connect) => getItem(baseItem, connect));
    }

    return computer.value;
  };

  function * values () {
    const { length } = baseItems;
    let i = 0;
    while (i < length) {
      yield get(i)!;
      i++;
    }
  }

  return {
    get size () {
      return list.size;
    },
    get,
    watch,
    * entries () {
      const { length } = baseItems;
      let i = 0;
      while (i < length) {
        yield [i, get(i)!];
        i++;
      }
    },
    values,
    [Symbol.iterator] () {
      return values();
    },
  };
}
