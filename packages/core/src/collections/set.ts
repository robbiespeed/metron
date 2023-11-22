import { emptyFn } from '../shared.js';
import { EMITTER, ORB } from '../atom.js';
import { createEmitter, type Emitter } from '../emitter.js';
import { createTransmitterOrb, type TransmitterOrb } from '../orb.js';
import {
  COLLECTION_EMIT_TYPE_CLEAR,
  COLLECTION_EMIT_TYPE_KEY_ADD,
  COLLECTION_EMIT_TYPE_KEY_DELETE,
  type AtomCollection,
  type AtomCollectionEmitClear,
  type AtomCollectionEmitKeyAdd,
  type AtomCollectionEmitKeyDelete,
} from './shared.js';

type AtomSetEmit<TKey = unknown> =
  | AtomCollectionEmitKeyAdd<TKey>
  | AtomCollectionEmitKeyDelete<TKey>
  | AtomCollectionEmitClear;

interface AtomSet<TValue>
  extends AtomCollection<
    TValue,
    TValue,
    ReadonlySet<TValue>,
    AtomSetEmit<TValue>
  > {
  // has(value: TValue): Atom<boolean>;
}

let AtomSetOrigin: {
  new <TValue>(
    inner: Set<TValue>,
    writer: AtomSetWriter<TValue>
  ): AtomSet<TValue>;
};

class AtomSetWriter<TValue> {
  #inner: Set<TValue>;
  #transmit: () => void = emptyFn;
  #emit: (message: AtomSetEmit<TValue>) => void = emptyFn;
  constructor(inner: Set<TValue>) {
    this.#inner = inner;
  }
  add(value: TValue): this {
    const inner = this.#inner;
    if (inner.has(value)) {
      return this;
    }
    const oldSize = inner.size;
    inner.add(value);
    const size = inner.size;
    this.#emit({
      type: COLLECTION_EMIT_TYPE_KEY_ADD,
      data: { key: value, oldSize, size },
    });
    this.#transmit();
    return this;
  }
  delete(value: TValue): boolean {
    const inner = this.#inner;
    if (!inner.has(value)) {
      return false;
    }
    const oldSize = inner.size;
    inner.delete(value);
    const size = inner.size;
    this.#emit({
      type: COLLECTION_EMIT_TYPE_KEY_DELETE,
      data: { key: value, oldSize, size },
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
      type: COLLECTION_EMIT_TYPE_CLEAR,
      data: { oldSize, size: 0 },
    });
    this.#transmit();
  }
  static {
    class AtomSet<TValue> {
      #inner: Set<TValue>;
      #writer: AtomSetWriter<TValue>;
      #orb?: TransmitterOrb<AtomSet<TValue>>;
      #emitter?: Emitter<AtomSetEmit<TValue>>;
      constructor(inner: Set<TValue>, writer: AtomSetWriter<TValue>) {
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
      get [EMITTER](): Emitter<AtomSetEmit<TValue>> {
        const existingEmitter = this.#emitter;
        if (existingEmitter !== undefined) {
          return existingEmitter;
        }

        const { emitter, emit } = createEmitter<AtomSetEmit<TValue>>();

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
      unwrap(): ReadonlySet<TValue> {
        return this.#inner;
      }
    }
    AtomSetOrigin = AtomSet;
  }
  static create<TValue>(
    values?: readonly TValue[]
  ): [AtomSet<TValue>, AtomSetWriter<TValue>] {
    const inner = new Set(values);
    const writer = new AtomSetWriter(inner);
    return [new AtomSetOrigin(inner, writer), writer];
  }
}

const createSet = AtomSetWriter.create;

function filterHandler<TInput, TOutput extends TInput>(
  writer: AtomSetWriter<TOutput>,
  predicate: (value: TInput) => value is TOutput,
  message: AtomSetEmit<TInput>
) {
  switch (message.type) {
    case 'CollectionClear': {
      writer.clear();
      break;
    }
    case 'CollectionKeyAdd': {
      const { key } = message.data;
      const shouldAdd = predicate(key);
      if (shouldAdd) {
        writer.add(key);
      }
      break;
    }
    case 'CollectionKeyDelete': {
      writer.delete(message.data.key as TOutput);
      break;
    }
  }
}

export function createFilteredSet<TInput, TOutput extends TInput>(
  input: AtomSet<TInput>,
  predicate: (value: TInput) => value is TOutput
) {
  // Initialize with current values
  const initialValues: TOutput[] = [];
  for (const value of input.unwrap()) {
    if (predicate(value)) {
      initialValues.push(value);
    }
  }
  const [output, writer] = createSet(initialValues);

  // Sync updates
  input[EMITTER].subscribe(
    filterHandler.bind(undefined, writer as any, predicate as any)
  );

  return output;
}

function mapHandler<TInput, TOutput extends TInput>(
  writer: AtomSetWriter<TOutput>,
  mapper: (value: TInput) => TOutput,
  lookup: Map<TInput, TOutput>,
  message: AtomSetEmit<TInput>
) {
  switch (message.type) {
    case 'CollectionClear': {
      lookup.clear();
      writer.clear();
      break;
    }
    case 'CollectionKeyAdd': {
      const { key } = message.data;
      const value = mapper(key);
      lookup.set(key, value);
      writer.add(value);
      break;
    }
    case 'CollectionKeyDelete': {
      const { key } = message.data;
      const value = lookup.get(key)!;
      lookup.delete(key);
      writer.delete(value);
      break;
    }
  }
}

export function createMappedSet<TInput, TOutput extends TInput>(
  input: AtomSet<TInput>,
  mapper: (value: TInput) => TOutput
) {
  // Initialize with current values
  const lookup = new Map<TInput, TOutput>();
  const initialValues: TOutput[] = [];
  for (const value of input.unwrap()) {
    const mappedValue = mapper(value);
    lookup.set(value, mappedValue);
    initialValues.push(mappedValue);
  }
  const [output, writer] = createSet(initialValues);

  // Sync updates
  input[EMITTER].subscribe(
    mapHandler.bind(undefined, writer as any, mapper as any, lookup)
  );

  return output;
}

// class KeyAtomRegistry<TKey, TValue> {
//   #weakAtoms = new Map<TKey, WeakRef<Atom<TValue | undefined>>>();
//   #weakTriggers = new Map<TKey, WeakRef<(isEmpty: boolean) => void>>();
//   getWeakTrigger(key: TKey): ((isEmpty: boolean) => void) | undefined {
//     return this.#weakTriggers.get(key)?.deref();
//   }
// }
