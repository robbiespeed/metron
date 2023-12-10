import { emptyFn } from '../shared.js';
import { EMITTER, ORB } from '../atom.js';
import {
  createRelayOrb,
  createTransmitterOrb,
  type TransmitterOrb,
} from '../orb.js';
import {
  COLLECTION_MESSAGE_TYPE_CLEAR,
  COLLECTION_MESSAGE_TYPE_KEY_ADD,
  COLLECTION_MESSAGE_TYPE_KEY_DELETE,
  type AtomCollection,
  type AtomCollectionMessageClear,
  type AtomCollectionMessageKeyAdd,
  type AtomCollectionMessageKeyDelete,
  MESSAGE_QUEUE,
} from './shared.js';
import { createMessageQueue, type MessageQueue } from './message-queue.js';
import { Stabilizer } from './stabilizer.js';
import { createEmitter, type Emitter } from '../emitter.js';

type AtomSetMessage<TKey = unknown> =
  | AtomCollectionMessageKeyAdd<TKey>
  | AtomCollectionMessageKeyDelete<TKey>
  | AtomCollectionMessageClear;

interface AtomSet<TValue>
  extends AtomCollection<
    TValue,
    TValue,
    ReadonlySet<TValue>,
    AtomSetMessage<TValue>
  > {
  // has(value: TValue): Atom<boolean>;
  [MESSAGE_QUEUE]: MessageQueue<AtomSetMessage<TValue>>;
}

class AtomSetWriter<TValue> {
  #inner: Set<TValue>;
  #transmit = emptyFn;
  #emit = emptyFn;
  #addMessage!: (message: AtomSetMessage<TValue>) => void;
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
    this.#addMessage({
      type: COLLECTION_MESSAGE_TYPE_KEY_ADD,
      data: { key: value, oldSize, size },
    });
    this.#emit();
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
    this.#addMessage({
      type: COLLECTION_MESSAGE_TYPE_KEY_DELETE,
      data: { key: value, oldSize, size },
    });
    this.#emit();
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
    this.#addMessage({
      type: COLLECTION_MESSAGE_TYPE_CLEAR,
      data: { oldSize, size: 0 },
    });
    this.#emit();
    this.#transmit();
  }
  static #AtomSet = class PrimaryAtomSet<TValue> implements AtomSet<TValue> {
    #inner: Set<TValue>;
    #writer: AtomSetWriter<TValue>;
    #orb: TransmitterOrb<PrimaryAtomSet<TValue>>;
    #messageQueue: MessageQueue<AtomSetMessage<TValue>>;
    #emitter?: Emitter;
    constructor(inner: Set<TValue>, writer: AtomSetWriter<TValue>) {
      this.#inner = inner;
      this.#writer = writer;
      const { orb, transmit } = createTransmitterOrb(this);
      this.#orb = orb;
      writer.#transmit = transmit;
      const { queue, addMessage } =
        createMessageQueue<AtomSetMessage<TValue>>();
      this.#messageQueue = queue;
      writer.#addMessage = addMessage;
    }
    get [ORB](): TransmitterOrb {
      return this.#orb;
    }
    get [EMITTER](): Emitter {
      const existingEmitter = this.#emitter;
      if (existingEmitter !== undefined) {
        return existingEmitter;
      }

      const { emitter, emit } = createEmitter();

      this.#emitter = emitter;
      this.#writer.#emit = emit;

      return emitter;
    }
    get [MESSAGE_QUEUE](): MessageQueue<AtomSetMessage<TValue>> {
      return this.#messageQueue;
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
  };
  static create<TValue>(
    values?: readonly TValue[]
  ): [AtomSet<TValue>, AtomSetWriter<TValue>] {
    const inner = new Set(values);
    const writer = new AtomSetWriter(inner);
    return [new AtomSetWriter.#AtomSet(inner, writer), writer];
  }
}

export const createSet = AtomSetWriter.create;

class StabilizedAtomSet<TValue> implements AtomSet<TValue> {
  #inner: Set<TValue>;
  #stabilizer: Stabilizer;
  #orb: TransmitterOrb;
  #messageQueue: MessageQueue<AtomSetMessage<TValue>>;
  constructor(
    inner: Set<TValue>,
    stabilizer: Stabilizer,
    orb: TransmitterOrb,
    messageQueue: MessageQueue<AtomSetMessage<TValue>>
  ) {
    this.#inner = inner;
    this.#stabilizer = stabilizer;
    this.#orb = orb;
    this.#messageQueue = messageQueue;
  }
  get [ORB](): TransmitterOrb {
    return this.#orb;
  }
  get [EMITTER](): Emitter {
    return this.#stabilizer.emitter;
  }
  get [MESSAGE_QUEUE](): MessageQueue<AtomSetMessage<TValue>> {
    return this.#messageQueue;
  }
  unwrap(): ReadonlySet<TValue> {
    this.#stabilizer.stabilize();
    return this.#inner;
  }
}

export function createMappedSet<TInput, TOutput extends TInput>(
  input: AtomSet<TInput>,
  mapper: (value: TInput) => TOutput
) {
  const inputQueue = input[MESSAGE_QUEUE];
  const inner = new Set<TOutput>();
  const { queue, addMessage } = createMessageQueue<AtomSetMessage<TOutput>>();
  function connectionHandler(didDisconnect: boolean): boolean {
    const { isStable } = stabilizer;
    if (didDisconnect || !isStable) {
      lookup.clear();
      inner.clear();
      stabilizer.destabilize();
    }
    return isStable;
  }
  const lookup = new Map<TInput, TOutput>();

  function handleMessage(message: AtomSetMessage<TInput>): boolean {
    switch (message.type) {
      case 'CollectionClear': {
        if (inner.size === 0) {
          break;
        }
        lookup.clear();
        inner.clear();
        addMessage(message);
        break;
      }
      case 'CollectionKeyAdd': {
        const { key, oldSize, size } = message.data;
        const value = mapper(key);
        lookup.set(key, value);
        inner.add(value);
        addMessage({
          type: COLLECTION_MESSAGE_TYPE_KEY_ADD,
          data: { key: value, oldSize, size },
        });
        break;
      }
      case 'CollectionKeyDelete': {
        const { key, oldSize, size } = message.data;
        const value = lookup.get(key)!;
        lookup.delete(key);
        inner.delete(value);
        addMessage({
          type: COLLECTION_MESSAGE_TYPE_KEY_DELETE,
          data: { key: value, oldSize, size },
        });
        break;
      }
      default: {
        throw new TypeError(
          `Unexpected message of type "${
            //@ts-expect-error message should be never
            message.type
          }"`
        );
      }
    }
    return true;
  }

  const stabilizer = new Stabilizer(() =>
    inputQueue.pullFromFirst(
      connectionHandler,
      handleMessage,
      (isSubscribed) => {
        if (isSubscribed) {
          return;
        }
        inputQueue.subscribe(connectionHandler);
        for (const value of input.unwrap()) {
          const mappedValue = mapper(value);
          lookup.set(value, mappedValue);
          inner.add(mappedValue);
        }
      }
    )
  );
  const orb = createRelayOrb(stabilizer, Stabilizer.intercept, [input[ORB]]);

  return new StabilizedAtomSet(inner, stabilizer, orb, queue);
}

export function createFilteredSet<TInput, TOutput extends TInput>(
  input: AtomSet<TInput>,
  predicate: (value: TInput) => value is TOutput
): AtomSet<TOutput>;
export function createFilteredSet<TValue>(
  input: AtomSet<TValue>,
  predicate: (value: TValue) => boolean
): AtomSet<TValue>;
export function createFilteredSet<TValue>(
  input: AtomSet<TValue>,
  predicate: (value: TValue) => boolean
): AtomSet<TValue> {
  const inputQueue = input[MESSAGE_QUEUE];
  const inner = new Set<TValue>();
  const { queue, addMessage } = createMessageQueue<AtomSetMessage<TValue>>();

  const connectionHandler = (didDisconnect: boolean): boolean => {
    const { isStable } = stabilizer;
    if (didDisconnect || !isStable) {
      // Either cleanup of input messages was forced (max messages in queue)
      // or output isn't stable and will get cleaned up
      inner.clear();
      stabilizer.destabilize();
    }
    return isStable;
  };

  const messageHandler = (message: AtomSetMessage<TValue>): boolean => {
    switch (message.type) {
      case 'CollectionClear': {
        inner.clear();
        addMessage(message);
        break;
      }
      case 'CollectionKeyAdd': {
        const { key } = message.data;
        if (predicate(key)) {
          inner.add(key);
          addMessage(message as AtomSetMessage<TValue>);
        }
        break;
      }
      case 'CollectionKeyDelete': {
        const { key } = message.data;
        if (inner.has(key as TValue)) {
          addMessage(message as AtomSetMessage<TValue>);
        }
        break;
      }
      default: {
        throw new TypeError(
          `Unexpected message of type "${
            //@ts-expect-error message should be never
            message.type
          }"`
        );
      }
    }
    return true;
  };

  const stabilizer = new Stabilizer(() =>
    inputQueue.pullFromFirst(
      connectionHandler,
      messageHandler,
      (isSubscribed) => {
        if (isSubscribed) {
          return;
        }
        inputQueue.subscribe(connectionHandler);
        for (const value of input.unwrap()) {
          if (predicate(value)) {
            inner.add(value);
          }
        }
      }
    )
  );
  const orb = createRelayOrb(stabilizer, Stabilizer.intercept, [input[ORB]]);

  return new StabilizedAtomSet(inner, stabilizer, orb, queue);
}
