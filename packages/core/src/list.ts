import { createSensor } from './sensor';
import { EmitterCallback, Particle } from './types';

export enum ListChangeType {
  Set,
  Push,
  Pop,
  Append,
  Splice,
  Clear,
}

interface ListChangeSingle {
  readonly t: (
    ListChangeType.Set |
    ListChangeType.Push |
    ListChangeType.Pop
  );
  readonly i: number;
}

interface ListChangeMany {
  readonly t: (
    ListChangeType.Append |
    ListChangeType.Splice
  );
  readonly s: number;
  readonly e: number;
}

interface ListChangeAll {
  readonly t: ListChangeType.Clear;
  readonly s: number;
}

export type ListChange = ListChangeSingle | ListChangeMany | ListChangeAll;

export class ParticleList <T> implements Particle {
  private _items: T[];
  private _sensor = createSensor<ListChange>();
  constructor (items: T[] = []) {
    this._items = items;

    this.watch = this.watch.bind(this);
  }
  get size () {
    return this._items.length;
  }
  get (index: number): T | undefined {
    return this._items[index];
  }
  getLast (): T | undefined {
    const { _items } = this;
    const index = _items.length - 1;

    if (index < 0) {
      return;
    }

    return _items[index];
  }
  set (index: number, value: T) {
    const items = this._items;

    if (value === items[index]) {
      return value;
    }

    items[index] = value;

    this._sensor.send({ t: ListChangeType.Set, i: index });
  }
  push (item: T) {
    const items = this._items;
    const index = items.length;
    items.push(item);

    this._sensor.send({ t: ListChangeType.Push, i: index });
  }
  append (items: T[]) {
    const { _items } = this;
    const start = _items.length;
    _items.push(...items);

    this._sensor.send(
      { t: ListChangeType.Append, s: start, e: _items.length - 1 }
    );
  }
  insert (index: number, item: T) {
    const items = this._items;
    const end = items.length;
    if (index === end) {
      return this.push(item);
    }

    items.splice(index, 0, item);

    this._sensor.send({ t: ListChangeType.Splice, s: index, e: end });
  }
  splice (start: number, deleteCount: number, items?: T[]) {
    const { _items } = this;
    let end = _items.length;
    let answer: T[];

    if (items) {
      end += items.length;
      answer = _items.splice(start, deleteCount, ...items);
    }
    else {
      answer = _items.splice(start, deleteCount);
    }

    end = Math.max(end - answer.length, _items.length);

    this._sensor.send({ t: ListChangeType.Splice, s: start, e: end });

    return answer;
  }
  pop () {
    const items = this._items;

    const result = items.pop();

    this._sensor.send({ t: ListChangeType.Pop, i: items.length });

    return result;
  }
  remove (index: number) {
    const items = this._items;
    const end = items.length - 1;
    if (index === end) {
      return this.pop();
    }

    const [ value ] = items.splice(index, 1);

    this._sensor.send({ t: ListChangeType.Splice, s: index, e: end });

    return value;
  }
  indexOf (value: T, fromIndex?: number) {
    return this._items.indexOf(value, fromIndex);
  }
  lastIndexOf (value: T, fromIndex?: number) {
    return this._items.lastIndexOf(value, fromIndex);
  }
  clear () {
    const { size } = this;
    this._items = [];
    this._sensor.send({ t: ListChangeType.Clear, s: size });
  }
  watch (callback: EmitterCallback<ListChange>) {
    return this._sensor.watch(callback);
  }
  entries () {
    return this._items.entries();
  }
  keys () {
    return this._items.keys();
  }
  values () {
    return this._items.values();
  }
  [Symbol.iterator] () {
    return this._items.values();
  }
}
