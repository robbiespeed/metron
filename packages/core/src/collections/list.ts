import { EMITTER, ORB } from '../atom.js';
import { createEmitter, type EmitMessage, type Emitter } from '../emitter.js';
import { createTransmitterOrb, type TransmitterOrb } from '../orb.js';
import { emptyFn } from '../shared.js';
import {
  COLLECTION_EMIT_TYPE_CLEAR,
  COLLECTION_EMIT_TYPE_KEY_ADD,
  COLLECTION_EMIT_TYPE_KEY_DELETE,
  COLLECTION_EMIT_TYPE_KEY_WRITE,
  type AtomCollection,
  type AtomCollectionEmit,
} from './shared.js';

export const ARRAY_EMIT_TYPE_APPEND = 'ArrayAppend';

export type AtomArrayEmitAppend = EmitMessage<
  typeof ARRAY_EMIT_TYPE_APPEND,
  {
    readonly size: number;
    readonly oldSize: number;
  }
>;

type AtomArrayEmit = AtomCollectionEmit<number> | AtomArrayEmitAppend;

interface AtomArray<TValue>
  extends AtomCollection<number, TValue, ReadonlyArray<TValue>, AtomArrayEmit> {
  // has(value: TValue): Atom<boolean>;
}

let AtomArrayOrigin: {
  new <TValue>(
    inner: TValue[],
    writer: AtomArrayWriter<TValue>
  ): AtomArray<TValue>;
};

const INDEX_OUT_OF_BOUNDS_MESSAGE = 'Index out of bounds';

class AtomArrayWriter<TValue> {
  #inner: TValue[];
  #transmit: () => void = emptyFn;
  #emit?: (message: AtomArrayEmit) => void;
  constructor(inner: TValue[]) {
    this.#inner = inner;
  }
  set(index: number, value: TValue): this {
    const inner = this.#inner;
    const size = inner.length;
    if (index >> 0 !== index || index < 0 || index >= size) {
      throw new RangeError(INDEX_OUT_OF_BOUNDS_MESSAGE);
    }

    if (value === inner[index]) {
      return this;
    }

    inner[index] = value;
    this.#emit?.({
      type: COLLECTION_EMIT_TYPE_KEY_WRITE,
      data: { key: index, size },
    });
    this.#transmit();
    return this;
  }
  push(value: TValue): void {
    const inner = this.#inner;
    const oldSize = inner.length;
    inner.push(value);
    this.#emit?.({
      type: COLLECTION_EMIT_TYPE_KEY_ADD,
      data: { key: oldSize, oldSize, size: inner.length },
    });
    this.#transmit();
  }
  append(values: TValue[]): void {
    const appendCount = values.length;
    if (appendCount === 0) {
      return;
    } else if (appendCount === 1) {
      return this.push(values[0]!);
    }
    const inner = this.#inner;
    const oldSize = inner.length;
    inner.push(...values);
    this.#emit?.({
      type: ARRAY_EMIT_TYPE_APPEND,
      data: { oldSize, size: inner.length },
    });
    this.#transmit();
  }
  insert(index: number, value: TValue): void {
    const inner = this.#inner;
    const oldSize = inner.length;
    if (index === oldSize) {
      return this.push(value);
    }

    if (index >> 0 !== index || index < 0 || index > oldSize) {
      throw new RangeError(INDEX_OUT_OF_BOUNDS_MESSAGE);
    }

    if (index === 0) {
      inner.unshift(value);
    } else {
      inner.splice(index, 0, value);
    }

    this.#emit?.({
      type: COLLECTION_EMIT_TYPE_KEY_ADD,
      data: { key: index, oldSize, size: inner.length },
    });
    this.#transmit();
  }
  delete(index: number): boolean {
    const inner = this.#inner;
    const oldSize = inner.length;

    if (index >> 0 !== index || index < 0 || index >= oldSize) {
      return false;
    }

    if (index === oldSize - 1) {
      inner.pop()!;
    } else {
      inner.splice(index, 1);
    }

    const size = inner.length;
    this.#emit?.({
      type: COLLECTION_EMIT_TYPE_KEY_DELETE,
      data: { key: index, oldSize, size },
    });
    this.#transmit();
    return true;
  }
  clear(): void {
    const inner = this.#inner;
    const oldSize = inner.length;
    if (oldSize === 0) {
      return;
    }
    inner.length = 0;
    this.#emit?.({
      type: COLLECTION_EMIT_TYPE_CLEAR,
      data: { oldSize, size: 0 },
    });
    this.#transmit();
  }
  static {
    class AtomArray<TValue> {
      #inner: TValue[];
      #writer: AtomArrayWriter<TValue>;
      #orb?: TransmitterOrb<AtomArray<TValue>>;
      #emitter?: Emitter<AtomArrayEmit>;
      constructor(inner: TValue[], writer: AtomArrayWriter<TValue>) {
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
      get [EMITTER](): Emitter<AtomArrayEmit> {
        const existingEmitter = this.#emitter;
        if (existingEmitter !== undefined) {
          return existingEmitter;
        }

        const { emitter, emit } = createEmitter<AtomArrayEmit>();

        this.#emitter = emitter;
        this.#writer.#emit = emit;

        return emitter;
      }
      unwrap(): ReadonlyArray<TValue> {
        return this.#inner;
      }
    }
    AtomArrayOrigin = AtomArray;
  }
  static create<TKey, TValue>(
    values?: readonly TValue[]
  ): [AtomArray<TValue>, AtomArrayWriter<TValue>] {
    const inner = values === undefined ? [] : values.slice();
    const writer = new AtomArrayWriter(inner);
    return [new AtomArrayOrigin(inner, writer), writer];
  }
}

export const createArray = AtomArrayWriter.create;

function increaseLookupRightOf(lookup: (number | undefined)[], index: number) {
  const lookupLength = lookup.length;
  for (let i = index + 1; i < lookupLength; i++) {
    const dirtyIndex = lookup[i];
    if (dirtyIndex !== undefined) {
      lookup[i] = dirtyIndex + 1;
    }
  }
}

function decreaseLookupRightOf(lookup: (number | undefined)[], index: number) {
  const lookupLength = lookup.length;
  for (let i = index + 1; i < lookupLength; i++) {
    const dirtyIndex = lookup[i];
    if (dirtyIndex !== undefined) {
      lookup[i] = dirtyIndex - 1;
    }
  }
}

/**
 * Find closest left index in output
 */
function findInsertIndexLeftOf(lookup: (number | undefined)[], key: number) {
  let insertIndex = undefined;
  for (let i = key - 1; insertIndex === undefined && i > 0; i--) {
    insertIndex = lookup[i];
  }
  insertIndex ??= 0;
  return insertIndex;
}

// TODO: Bench perf of converting this to a class
function filterHandler<TInput, TOutput extends TInput>(
  lookup: (number | undefined)[],
  inputInner: ReadonlyArray<TInput>,
  outputInner: ReadonlyArray<TOutput>,
  writer: AtomArrayWriter<TOutput>,
  predicate: (value: TInput) => value is TOutput,
  message: AtomArrayEmit
) {
  switch (message.type) {
    case 'CollectionClear': {
      lookup.length = 0;
      writer.clear();
      return;
    }
    case 'CollectionKeyAdd': {
      const { key, oldSize } = message.data;
      const value = inputInner[key]!;
      const outputIndex = lookup[key];
      const shouldAdd = predicate(value);

      if (outputIndex === undefined) {
        if (shouldAdd) {
          if (key === oldSize) {
            lookup[key] = outputInner.length;
            writer.push(value);
          } else {
            const insertIndex = findInsertIndexLeftOf(lookup, key);
            lookup.splice(key, 0, insertIndex);
            increaseLookupRightOf(lookup, key);
            writer.insert(insertIndex, value);
          }
          return;
        }
        if (key !== oldSize) {
          lookup.splice(key, 0, undefined);
        }
        return;
      }

      if (shouldAdd) {
        lookup.splice(key, 0, outputIndex);
        increaseLookupRightOf(lookup, key);
        writer.insert(outputIndex, value);
      } else {
        lookup.splice(key, 0, undefined);
      }
      return;
    }
    case 'CollectionKeyDelete': {
      const { key, oldSize, size } = message.data;
      const outputIndex = lookup[key];

      if (outputIndex === undefined) {
        if (key === oldSize) {
          lookup.length = size;
        } else {
          lookup.splice(key, 1);
        }
        return;
      }

      if (key === oldSize) {
        lookup.length = size;
      } else {
        lookup.splice(key, 1);
        decreaseLookupRightOf(lookup, key);
      }
      writer.delete(outputIndex);

      return;
    }
    case 'CollectionKeyWrite': {
      const { key } = message.data;
      const value = inputInner[key]!;
      const outputIndex = lookup[key];
      const shouldInclude = predicate(value);
      if (outputIndex === undefined) {
        if (shouldInclude) {
          const insertIndex = findInsertIndexLeftOf(lookup, key);
          lookup[key] = insertIndex;
          increaseLookupRightOf(lookup, key);
          writer.insert(insertIndex, value);
        }
        return;
      }

      if (shouldInclude) {
        writer.set(outputIndex, value);
      } else {
        lookup[key] = undefined;
        decreaseLookupRightOf(lookup, key);
        writer.delete(outputIndex);
      }
      return;
    }
    case 'ArrayAppend': {
      const { oldSize, size } = message.data;
      const outputValues: TOutput[] = [];
      let outputLength = outputInner.length;
      for (let i = oldSize; i < size; i++) {
        const value = inputInner[i]!;
        if (predicate(value)) {
          lookup[i] = outputLength++;
          outputValues.push(value);
        } else {
          lookup[i] = undefined;
        }
      }
      writer.append(outputValues);
      return;
    }
  }
  throw new Error(
    `Unhandled message type "${
      // @ts-expect-error
      message.type
    }"`
  );
}

export function createFilteredArray<TInput, TOutput extends TInput>(
  input: AtomArray<TInput>,
  predicate: (value: TInput) => value is TOutput
) {
  // Initialize with current values
  const inputInner = input.unwrap();
  const lookup: (undefined | number)[] = [];
  const initialValues: TOutput[] = [];
  const inputLength = inputInner.length;
  for (let i = 0; i < inputLength; i++) {
    const value = inputInner[i]!;
    if (predicate(value)) {
      lookup[i] = initialValues.length;
      initialValues.push(value);
    } else {
      lookup[i] = undefined;
    }
  }
  for (const value of input.unwrap()) {
    if (predicate(value)) {
      initialValues.push(value);
    }
  }
  const [output, writer] = createArray(initialValues);

  // Sync updates
  input[EMITTER].subscribe(
    filterHandler.bind(
      undefined,
      lookup,
      inputInner,
      output.unwrap(),
      writer as any,
      predicate as any
    )
  );

  return output;
}

function mapHandler<TInput, TOutput extends TInput>(
  inputInner: ReadonlyArray<TInput>,
  writer: AtomArrayWriter<TOutput>,
  mapper: (value: TInput) => TOutput,
  message: AtomArrayEmit
) {
  switch (message.type) {
    case 'CollectionClear': {
      writer.clear();
      return;
    }
    case 'CollectionKeyWrite':
    case 'CollectionKeyAdd': {
      const { key } = message.data;
      writer.set(key, mapper(inputInner[key]!));
      return;
    }
    case 'CollectionKeyDelete': {
      const { key } = message.data;
      writer.delete(key);
      return;
    }
    case 'ArrayAppend': {
      const { oldSize, size } = message.data;
      const outputValues: TOutput[] = [];
      for (let i = oldSize; i < size; i++) {
        outputValues.push(mapper(inputInner[i]!));
      }
      writer.append(outputValues);
      return;
    }
  }
}

export function createMappedArray<TInput, TOutput extends TInput>(
  input: AtomArray<TInput>,
  mapper: (value: TInput) => TOutput
) {
  // Initialize with current values
  const inputInner = input.unwrap();
  const initialValues: TOutput[] = [];
  for (const value of inputInner) {
    initialValues.push(mapper(value));
  }
  const [output, writer] = createArray(initialValues);

  // Sync updates
  input[EMITTER].subscribe(
    mapHandler.bind(undefined, inputInner, writer as any, mapper as any)
  );

  return output;
}
