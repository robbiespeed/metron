import { EMITTER, ORB } from '../atom.js';
import { createEmitter, type Emitter } from '../emitter.js';
import { createTransmitterOrb, type TransmitterOrb } from '../orb.js';
import { emptyFn } from '../shared.js';
import {
  COLLECTION_MESSAGE_TYPE_CLEAR,
  COLLECTION_MESSAGE_TYPE_KEY_ADD,
  COLLECTION_MESSAGE_TYPE_KEY_DELETE,
  COLLECTION_MESSAGE_TYPE_KEY_WRITE,
  type AtomCollection,
  type AtomCollectionMessage,
} from './shared.js';

type AtomMapEmit<TKey = unknown> = AtomCollectionMessage<TKey>;

interface AtomMap<TKey, TValue>
  extends AtomCollection<
    TKey,
    TValue,
    ReadonlyMap<TKey, TValue>,
    AtomMapEmit<TKey>
  > {
  // has(value: TValue): Atom<boolean>;
}

let AtomMapOrigin: {
  new <TKey, TValue>(
    inner: Map<TKey, TValue>,
    writer: AtomMapWriter<TKey, TValue>
  ): AtomMap<TKey, TValue>;
};

class AtomMapWriter<TKey, TValue> {
  #inner: Map<TKey, TValue>;
  #transmit: () => void = emptyFn;
  #emit: (message: AtomMapEmit<TKey>) => void = emptyFn;
  constructor(inner: Map<TKey, TValue>) {
    this.#inner = inner;
  }
  set(key: TKey, value: TValue): this {
    const inner = this.#inner;
    const oldSize = inner.size;
    if (inner.has(key)) {
      const oldValue = inner.get(key);
      if (oldValue === value) {
        return this;
      }
      inner.set(key, value);
      this.#emit({
        type: COLLECTION_MESSAGE_TYPE_KEY_WRITE,
        data: { key, size: oldSize },
      });
    } else {
      inner.set(key, value);
      const size = inner.size;
      this.#emit({
        type: COLLECTION_MESSAGE_TYPE_KEY_ADD,
        data: { key, oldSize, size },
      });
    }
    this.#transmit();
    return this;
  }
  delete(key: TKey): boolean {
    const inner = this.#inner;
    if (!inner.has(key)) {
      return false;
    }
    const oldSize = inner.size;
    inner.delete(key);
    const size = inner.size;
    this.#emit({
      type: COLLECTION_MESSAGE_TYPE_KEY_DELETE,
      data: { key, oldSize, size },
    });
    this.#transmit();
    return true;
  }
  clear(): void {
    const inner = this.#inner;
    const oldSize = inner.size;
    if (oldSize === 0) {
      return;
    }
    inner.clear();
    this.#emit({
      type: COLLECTION_MESSAGE_TYPE_CLEAR,
      data: { oldSize, size: 0 },
    });
    this.#transmit();
  }
  static {
    class AtomMap<TKey, TValue> {
      #inner: Map<TKey, TValue>;
      #writer: AtomMapWriter<TKey, TValue>;
      #orb?: TransmitterOrb<AtomMap<TKey, TValue>>;
      #emitter?: Emitter<AtomMapEmit<TKey>>;
      constructor(
        inner: Map<TKey, TValue>,
        writer: AtomMapWriter<TKey, TValue>
      ) {
        this.#inner = inner;
        this.#writer = writer;
      }
      get [ORB](): TransmitterOrb {
        const existingNode = this.#orb;
        if (existingNode !== undefined) {
          return existingNode;
        }

        const { orb, transmit } = createTransmitterOrb(this);
        this.#orb = orb;
        this.#writer.#transmit = transmit;

        return orb;
      }
      get [EMITTER](): Emitter<AtomMapEmit<TKey>> {
        const existingEmitter = this.#emitter;
        if (existingEmitter !== undefined) {
          return existingEmitter;
        }

        const { emitter, emit } = createEmitter<AtomMapEmit<TKey>>();

        this.#emitter = emitter;
        this.#writer.#emit = emit;

        return emitter;
      }
      // get size(): Atom<number> {
      //   throw 0;
      // }
      // has(value: TValue): Atom<boolean> {
      //   throw 0;
      // }
      unwrap(): ReadonlyMap<TKey, TValue> {
        return this.#inner;
      }
    }
    AtomMapOrigin = AtomMap;
  }
  static create<TKey, TValue>(
    entries?: readonly [TKey, TValue][]
  ): [AtomMap<TKey, TValue>, AtomMapWriter<TKey, TValue>] {
    const inner = new Map(entries);
    const writer = new AtomMapWriter(inner);
    return [new AtomMapOrigin(inner, writer), writer];
  }
}

export const createMap = AtomMapWriter.create;

// TODO: Bench perf of converting this to a class
function filterHandler<TKey, TInput, TOutput extends TInput>(
  inputInner: ReadonlyMap<TKey, TInput>,
  writer: AtomMapWriter<TKey, TOutput>,
  predicate: (value: TInput) => value is TOutput,
  message: AtomMapEmit<TKey>
) {
  switch (message.type) {
    case 'CollectionClear': {
      writer.clear();
      break;
    }
    case 'CollectionKeyAdd': {
      const { key } = message.data;
      const value = inputInner.get(key)!;
      const shouldAdd = predicate(value);
      if (shouldAdd) {
        writer.set(key, value);
      }
      break;
    }
    case 'CollectionKeyDelete': {
      writer.delete(message.data.key);
      break;
    }
    case 'CollectionKeyWrite': {
      const { key } = message.data;
      const value = inputInner.get(key)!;
      const shouldKeep = predicate(value);
      if (shouldKeep) {
        writer.set(key, value);
      } else {
        writer.delete(key);
      }
    }
  }
}

export function createFilteredMap<TKey, TInput, TOutput extends TInput>(
  input: AtomMap<TKey, TInput>,
  predicate: (value: TInput) => value is TOutput
) {
  // Initialize with current values
  const inputInner = input.unwrap();
  const initialEntries: [TKey, TOutput][] = [];
  for (const entry of input.unwrap()) {
    if (predicate(entry[1])) {
      initialEntries.push(entry as [TKey, TOutput]);
    }
  }
  const [output, writer] = createMap(initialEntries);

  // Sync updates
  input[EMITTER].subscribe(
    filterHandler.bind(undefined, inputInner, writer as any, predicate as any)
  );

  return output;
}

function mapHandler<TKey, TInput, TOutput extends TInput>(
  inputInner: ReadonlyMap<TKey, TInput>,
  writer: AtomMapWriter<TKey, TOutput>,
  mapper: (value: TInput) => TOutput,
  message: AtomMapEmit<TKey>
) {
  switch (message.type) {
    case 'CollectionClear': {
      writer.clear();
      break;
    }
    case 'CollectionKeyWrite':
    case 'CollectionKeyAdd': {
      const { key } = message.data;
      writer.set(key, mapper(inputInner.get(key)!));
      break;
    }
    case 'CollectionKeyDelete': {
      const { key } = message.data;
      writer.delete(key);
      break;
    }
  }
}

export function createMappedMap<TKey, TInput, TOutput extends TInput>(
  input: AtomMap<TKey, TInput>,
  mapper: (value: TInput) => TOutput
) {
  // Initialize with current values
  const inputInner = input.unwrap();
  const initialEntries: [TKey, TOutput][] = [];
  for (const [key, value] of inputInner) {
    initialEntries.push([key, mapper(value)]);
  }
  const [output, writer] = createMap(initialEntries);

  // Sync updates
  input[EMITTER].subscribe(
    mapHandler.bind(undefined, inputInner, writer as any, mapper as any)
  );

  return output;
}
