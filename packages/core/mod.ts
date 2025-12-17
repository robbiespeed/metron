export type AtomAccessor<TValue = unknown> = (read: Reader) => TValue;

export type Atomic<TValue = unknown> = Atom<TValue> | AtomAccessor<TValue>;

// deno-lint-ignore no-explicit-any
export type Source<TValue> = Atomic<TValue> | (TValue extends (...args: any[]) => unknown ? never : TValue);

export interface Reader {
  <TValue>(readable: Atom<TValue>): TValue;
}

export type Setter<TValue> = <TNextValue extends TValue>(value: TNextValue) => TNextValue;

interface AtomConstructor {
  new <TValue>(): Atom<TValue>;
}

interface Link {
  version: Reader;
  consumer: Relay;
  source: Atom;
  nextSource: Link | undefined;
  nextConsumer: Link | undefined;
  prevConsumer: Link;
}

interface RecycledLink {
  version: undefined;
  consumer: undefined;
  source: undefined;
  nextSource: RecycledLink | undefined;
  nextConsumer: undefined;
  prevConsumer: undefined;
}

interface Relay<TValue = unknown> {
  depth: number;
  nextDirty: Relay | undefined;
  reader: Reader | undefined;
  run(read: Reader): TValue;
  sourceHead: Link | undefined;
  sourceTail: Link | undefined;
  transmitAtom: WeakRef<Atom> | Atom | undefined;
  value: TValue | undefined;
}

const ATOM_TYPE_NONE = 0;
const ATOM_TYPE_DESTROYED = 1;
const ATOM_TYPE_STATE = 2;
const ATOM_TYPE_FROZEN = 3;
const ATOM_TYPE_DERIVE = 4;
const ATOM_TYPE_COMPUTE = 5;
const ATOM_TYPE_DERIVE_STATIC = 6;
const ATOM_TYPE_COMPUTE_STATIC = 7;

const ATOM_FLAG_TYPE_SPACE = 7;
const ATOM_FLAG_CAN_HEAP = 8 << 1;
const ATOM_FLAG_OWNED = 8 << 2;
const ATOM_FLAG_HAS_ERROR = 8 << 3;
const ATOM_FLAG_DIRTY = 8 << 4;
const ATOM_FLAG_IN_RECEIVE = 8 << 6;
const ATOM_FLAG_IN_FALLBACK = 8 << 7;

const ATOM_FLAG_MAYBE_IN_HEAP = ATOM_FLAG_IN_RECEIVE | ATOM_FLAG_DIRTY;
const ATOM_FLAG_NON_DIRTY = ATOM_FLAG_TYPE_SPACE | ATOM_FLAG_CAN_HEAP | ATOM_FLAG_OWNED | ATOM_FLAG_HAS_ERROR | ATOM_FLAG_IN_RECEIVE | ATOM_FLAG_IN_FALLBACK;
const ATOM_FLAG_NON_FALLBACK = ATOM_FLAG_TYPE_SPACE | ATOM_FLAG_CAN_HEAP | ATOM_FLAG_OWNED | ATOM_FLAG_HAS_ERROR | ATOM_FLAG_DIRTY | ATOM_FLAG_IN_RECEIVE;

const disposedHandler = () => { };

const owners = new WeakMap<Atom, Atom>();

let cleanRelay: (relay: Relay) => undefined;
let createLink: (consumer: Relay, source: Atom) => undefined;
let emit: (atom: Atom) => undefined;
let setOwner: (atom: Atom, owner: Atom) => undefined;
let initStateController: <TValue>(controller: AtomStateController<TValue>, atom: Atom<TValue>) => undefined;
let receive: (atom: Atom) => undefined;
let stabilize: () => undefined;
let stabilizeRelay: (relay: Relay, atom: Atom) => undefined;
let transmit: (atom: Atom) => undefined;
let stateSet: <TValue>(atom: Atom<TValue>, value: TValue) => TValue;
let bindableSetter: <TValue>(this: Atom<TValue>, value: TValue) => TValue;
let insertIntoHeap: (atom: Atom) => undefined;
let createSubscription: (atom: Atom, handler: () => unknown, queue: AtomSubscription[]) => AtomSubscription;
let subHeadGet: (atom: Atom) => AtomSubscription | undefined;
let subHeadSet: (atom: Atom, subscription: AtomSubscription | undefined) => undefined;

class AtomStateController<TValue = unknown> {
  #atom!: Atom<TValue>;
  get atom(): Atom<TValue> {
    return this.#atom;
  }
  setState(value: TValue): TValue {
    return stateSet(this.#atom, value);
  }
  mutateState(mutator: (value: TValue) => TValue): TValue {
    return stateSet(this.#atom, mutator(this.#atom.unwrap()));
  }
  setOwner(owner: Atom): undefined {
    setOwner(this.#atom, owner);
  }
  transmit(): undefined {
    transmit(this.#atom);
  }
  static {
    initStateController = function initStateController<TValue>(controller: AtomStateController<TValue>, atom: Atom<TValue>) {
      controller.#atom = atom;
    }
  }
}
export type { AtomStateController };

class AtomSubscription {
  #canQueue = true;
  #atom!: Atom;
  #handler!: () => unknown;
  #channelQueue!: AtomSubscription[];
  #next?: AtomSubscription;
  #prev?: AtomSubscription;
  run(): undefined {
    this.#canQueue = true;
    this.#handler();
  }
  [Symbol.dispose](): undefined {
    if (this.#handler === disposedHandler) {
      return;
    }
    this.#canQueue = false;
    this.#handler = disposedHandler;
    if (this.#prev === undefined) {
      subHeadSet(this.#atom, this.#next);
    } else {
      this.#prev.#next = this.#next;
    }
  }
  dispose(): undefined {
    this[Symbol.dispose]();
  }
  static {
    emit = function emit(atom) {
      let item = subHeadGet(atom);
      while (item !== undefined) {
        if (item.#canQueue) {
          item.#canQueue = false;
          item.#channelQueue.push(item);
        }
        item = item.#next;
      }
    }
    createSubscription = function createSubscription(atom, handler, queue) {
      const sub = new AtomSubscription();
      sub.#atom = atom;
      sub.#handler = handler;
      sub.#channelQueue = queue;
      const subHead = subHeadGet(atom);
      sub.#next = subHead;
      if (subHead !== undefined) {
        subHead.#prev = sub;
      }
      subHeadSet(atom, sub);
      return sub;
    }
  }
}

export type { AtomSubscription };

export class AtomSubscriptionChannel {
  #queue: AtomSubscription[] = [];
  #errorHandler: (cause: unknown) => undefined;
  #i = 0;
  constructor(errorHandler: (cause: unknown) => undefined) {
    this.#errorHandler = errorHandler;
  }
  subscribe(atom: Atom, handler: () => unknown): AtomSubscription {
    return createSubscription(atom, handler, this.#queue);
  }
  run(): undefined {
    const queue = this.#queue;
    if (queue.length === 0) {
      return;
    }
    while (this.#i < queue.length) {
      const item = queue[this.#i++]!;
      try {
        item.run();
      } catch (err) {
        this.#errorHandler(err);
      }
    }
    this.#i = 0;
    queue.length = 0;
  }
  clear(): undefined {
    this.#queue.length = 0;
  }
}

let heapCount = 0;

export class Atom<TValue = unknown> {
  #flags = ATOM_TYPE_NONE;
  #state: unknown;
  #subscriptionHead: AtomSubscription | undefined;
  #consumerHead: Link | undefined;
  unwrap(): TValue {
    if (this.#flags & ATOM_FLAG_OWNED) {
      owners.get(this)!.unwrap();
    }
    switch (this.#flags & ATOM_FLAG_TYPE_SPACE) {
      case ATOM_TYPE_NONE:
        throw new Error("Cannot unwrap uninitialized Atom");
      case ATOM_TYPE_DESTROYED:
        throw new Error("Cannot unwrap destroyed Atom");
      case ATOM_TYPE_STATE:
        return this.#state as TValue;
      case ATOM_TYPE_DERIVE:
      case ATOM_TYPE_COMPUTE: {
        const relay = this.#state as Relay<TValue>;
        stabilizeRelay(relay, this);
        if (this.#flags & ATOM_FLAG_HAS_ERROR) {
          throw relay.value!;
        }
        return relay.value!;
      }
      case ATOM_TYPE_FROZEN:
      case ATOM_TYPE_DERIVE_STATIC:
      case ATOM_TYPE_COMPUTE_STATIC:
      default:
        throw new Error(`Unimplemented Atom type (${this.#flags & ATOM_FLAG_TYPE_SPACE})`);
    }
  }
  static createStateWithSetter<TValue>(initialValue: TValue): [Atom<TValue>, Setter<TValue>] {
    const atom = new (this as unknown as AtomConstructor)<TValue>();
    atom.#state = initialValue;
    atom.#flags = ATOM_TYPE_STATE;
    return [atom, bindableSetter.bind(atom) as Setter<TValue>];
  }
  static createStateController<TValue>(initialValue: TValue): AtomStateController<TValue> {
    const atom = new (this as unknown as AtomConstructor)<TValue>();
    atom.#state = initialValue;
    atom.#flags = ATOM_TYPE_STATE;
    const controller = new AtomStateController<TValue>();
    initStateController(controller, atom);
    return controller;
  }
  static createDerived<TValue>(derivation: (read: Reader) => TValue): Atom<TValue> {
    const atom = new (this as unknown as AtomConstructor)<TValue>();
    atom.#state = {
      depth: -1,
      nextDirty: undefined,
      sourceHead: undefined,
      sourceTail: undefined,
      reader: undefined,
      run: derivation,
      transmitAtom: new WeakRef(atom),
      value: undefined,
    } as Relay<TValue>;
    atom.#flags = ATOM_TYPE_DERIVE | ATOM_FLAG_DIRTY;
    return atom;
  }
  static createComputed<TValue>(computation: (this: Atom<never>, read: Reader) => TValue): Atom<TValue> {
    const atom = new (this as unknown as AtomConstructor)<TValue>();
    atom.#state = {
      depth: 0,
      nextDirty: undefined,
      sourceHead: undefined,
      sourceTail: undefined,
      reader: undefined,
      run: computation,
      transmitAtom: new WeakRef(atom),
      value: undefined,
    } as Relay<TValue>;

    atom.#flags = ATOM_TYPE_COMPUTE | ATOM_FLAG_CAN_HEAP | ATOM_FLAG_DIRTY;
    heapCount++; // Because unwrap will reduce the count
    receive(atom);
    return atom;
  }

  static {
    setOwner = function (atom, owner) {
      if ((owner.#flags & ATOM_FLAG_CAN_HEAP) === 0) {
        throw new Error("Owner must be an effect");
      }
      if (atom.#flags & ATOM_FLAG_OWNED) {
        throw new Error("Atom cannot have multiple owners");
      }
      atom.#flags |= ATOM_FLAG_OWNED;
      owners.set(atom, owner);
    }
    stateSet = function (atom, value) {
      if (atom.#state === value) {
        return value;
      }
      atom.#state = value;
      transmit(atom);
      return value;
    }
    bindableSetter = function (value) {
      if (this.#state === value) {
        return value;
      }
      this.#state = value;
      transmit(this);
      return value;
    }
    subHeadGet = function (atom) {
      return atom.#subscriptionHead;
    }
    subHeadSet = function (atom, subscription) {
      atom.#subscriptionHead = subscription;
    }

    const transmitStack: Link[] = [];
    transmit = function (atom: Atom) {
      emit(atom);

      let link = atom.#consumerHead;
      let consumer: Relay;
      let nextConsumerLink: Link | undefined;
      let linkVersion: Reader;

      while (link !== undefined) {
        consumer = link.consumer;
        nextConsumerLink = link.nextConsumer;
        linkVersion = link.version;
        consumerHandler: if (consumer.reader === linkVersion) {
          let consumerAtom = consumer.transmitAtom;
          if (consumerAtom === undefined) {
            break consumerHandler;
          }
          if ("deref" in consumerAtom) {
            consumerAtom = consumerAtom.deref();
            if (consumerAtom === undefined) {
              consumer.reader = undefined;
              consumer.transmitAtom = undefined;
              consumer.sourceTail = undefined;
              scheduleRelayCleaning(consumer);
              break consumerHandler;
            }
          }

          consumer.sourceTail = undefined;
          consumer.reader = undefined;
          scheduleRelayCleaning(consumer);

          if (consumerAtom.#flags & ATOM_FLAG_CAN_HEAP) {
            insertIntoHeap(consumerAtom);
            consumerAtom.#flags |= ATOM_FLAG_DIRTY;
          } else {
            consumerAtom.#flags |= ATOM_FLAG_DIRTY;
            emit(consumerAtom);
            const childLinks = consumerAtom.#consumerHead;
            if (childLinks !== undefined) {
              if (nextConsumerLink !== undefined) {
                transmitStack.push(nextConsumerLink);
              }
              link = childLinks;
              continue;
            }
          }
        }

        link = nextConsumerLink ?? transmitStack.pop();
      }
    }

    createLink = function (consumer, source): undefined {
      const tail = consumer.sourceTail;
      let nextOld: Link | undefined;
      if (tail !== undefined) {
        if (tail.source === source) {
          return;
        }
        nextOld = tail.nextSource;
      } else {
        nextOld = consumer.sourceHead;
      }

      if (nextOld !== undefined && nextOld.source === source) {
        nextOld.version = consumer.reader!;
        nextOld.consumer = consumer;
        consumer.sourceTail = nextOld;
        return;
      }

      let link: Link;
      if (recycledLinkPool === undefined) {
        link = {
          version: consumer.reader!,
          source,
          consumer: consumer,
          nextSource: nextOld,
          nextConsumer: undefined,
          // deno-lint-ignore no-explicit-any
          prevConsumer: undefined as any,
        };
      } else {
        // deno-lint-ignore no-explicit-any
        link = recycledLinkPool as any;
        recycledLinkPool = recycledLinkPool.nextSource;
        link.consumer = consumer;
        link.source = source;
        link.nextSource = nextOld;
        link.version = consumer.reader!;
      }

      const sourceConsumers = source.#consumerHead;
      if (sourceConsumers === undefined) {
        link.prevConsumer = link;
        source.#consumerHead = link;
      } else {
        const oldConsumerTail = sourceConsumers.prevConsumer!;
        sourceConsumers.prevConsumer = link;
        link.prevConsumer = oldConsumerTail;
        oldConsumerTail.nextConsumer = link;
      }

      if (tail === undefined) {
        consumer.sourceHead = link;
      } else {
        tail.nextSource = link;
      }
      consumer.sourceTail = link;
    }

    stabilizeRelay = function (relay, atom) {
      if (atom.#flags & ATOM_FLAG_DIRTY) {
        receive(atom);
      } else if (heapCount && relay.depth >= minHeap) {
        stabilizeFallback(atom);
      }
    }

    receive = function (receiveAtom: Atom): undefined {
      const relay = (receiveAtom.#state as Relay);
      const nextFlags = receiveAtom.#flags & (ATOM_FLAG_TYPE_SPACE | ATOM_FLAG_CAN_HEAP);
      const canHeap = nextFlags & ATOM_FLAG_CAN_HEAP;
      receiveAtom.#flags = nextFlags | ATOM_FLAG_IN_RECEIVE;

      const read: Reader = <TValue>(atom: Atom<TValue>): TValue => {
        if (read !== relay.reader) {
          throw new Error("Attempted to use expired read");
        }
        if (atom.#flags & ATOM_FLAG_IN_RECEIVE) {
          throw new Error("Cannot read cyclicly");
        }
        if (atom.#flags & ATOM_FLAG_OWNED) {
          const owner = owners.get(atom)!;
          const ownerRelay = (owner.#state as Relay);
          const error = stabilizeRelay(ownerRelay, owner);
          if (error) {
            throw error;
          }

          if (canHeap) {
            if (relay.depth <= ownerRelay.depth) {
              relay.depth = ownerRelay.depth + 1;
            }
          } else if (relay.depth < ownerRelay.depth) {
            relay.depth = ownerRelay.depth;
          }
        }
        switch (atom.#flags & ATOM_FLAG_TYPE_SPACE) {
          case ATOM_TYPE_NONE:
            throw new Error("Cannot unwrap uninitialized Atom");
          case ATOM_TYPE_DESTROYED:
            throw new Error("Cannot unwrap destroyed Atom");
          case ATOM_TYPE_STATE: {
            createLink(relay, atom);
            return atom.#state as TValue;
          }
          case ATOM_TYPE_DERIVE:
          case ATOM_TYPE_COMPUTE: {
            const atomRelay = atom.#state as Relay<TValue>;
            // Must stabilize before linking otherwise link could be to a old version and thus inert.
            const error = stabilizeRelay(atomRelay, atom);
            createLink(relay, atom);
            if (error) {
              throw error;
            }
            if (canHeap) {
              if (relay.depth <= atomRelay.depth) {
                relay.depth = atomRelay.depth + 1;
              }
            } else if (relay.depth < atomRelay.depth) {
              relay.depth = atomRelay.depth;
            }
            return atomRelay.value!;
          }
          case ATOM_TYPE_FROZEN:
          case ATOM_TYPE_DERIVE_STATIC:
          case ATOM_TYPE_COMPUTE_STATIC:
          default:
            throw new Error(`Unimplemented Atom type (${atom.#flags & ATOM_FLAG_TYPE_SPACE})`);
        }
      };

      try {
        relay.depth = 0;
        if (canHeap) {
          heapCount--;
          relay.reader = read;
          const nextValue = relay.run.call(receiveAtom, read);
          if (relay.value !== nextValue) {
            relay.value = nextValue;
            transmit(receiveAtom);
          }
        } else {
          relay.reader = read;
          relay.value = relay.run.call(receiveAtom, read);
        }
        receiveAtom.#flags = nextFlags;
      } catch (cause) {
        relay.value = cause;
        receiveAtom.#flags = nextFlags | ATOM_FLAG_HAS_ERROR;
        if (canHeap) {
          transmit(receiveAtom);
        }
      }
    }

    cleanRelay = function cleanRelay(relay) {
      const sourcesTail = relay.sourceTail;
      let link =
        sourcesTail !== undefined
          ? sourcesTail.nextSource
          : relay.sourceHead;
      while (link !== undefined) {
        const source = link.source;
        const prevConsumer = link.prevConsumer;
        if (prevConsumer === link) {
          source.#consumerHead = undefined;
        } else {
          const nextConsumer = link.nextConsumer;
          if (nextConsumer === undefined) {
            source.#consumerHead!.prevConsumer = prevConsumer;
          } else {
            nextConsumer.prevConsumer = prevConsumer;
          }
          if (link === source.#consumerHead) {
            source.#consumerHead = nextConsumer;
          } else {
            prevConsumer.nextConsumer = nextConsumer;
          }
        }

        const nextLink = link.nextSource;
        (link as unknown as RecycledLink).nextSource = recycledLinkPool;
        recycledLinkPool = link as unknown as RecycledLink;

        recycledLinkPool.consumer = undefined;
        recycledLinkPool.source = undefined;
        recycledLinkPool.nextConsumer = undefined;
        recycledLinkPool.prevConsumer = undefined;

        link = nextLink;
      }

      if (sourcesTail === undefined) {
        relay.sourceHead = undefined;
      } else {
        sourcesTail.nextSource = undefined;
      }
    }

    let minHeap = Infinity;
    let maxHeap = -1;
    let nextMaxHeap = -1;
    const fallbackStack: Atom[] = [];
    const stabilizeHeaps: (Atom[] | undefined)[] = new Array(200);

    insertIntoHeap = function insertIntoHeap(atom) {
      if (atom.#flags & (ATOM_FLAG_MAYBE_IN_HEAP)) return;
      heapCount++;
      const relay = atom.#state as Relay;
      const depth = relay.depth;
      (stabilizeHeaps[depth] ??= []).push(atom);
      if (depth > maxHeap) {
        maxHeap = depth;
      } else if (depth <= minHeap) {
        nextMaxHeap = depth;
      }
      if (depth < minHeap) {
        minHeap = depth;
      }
    }

    function moveHeap(atom: Atom) {
      const relay = (atom.#state as Relay)
      const depth = relay.depth;
      (stabilizeHeaps[depth] ??= []).push(atom);
      if (depth > maxHeap) {
        maxHeap = depth;
      } else if (depth <= minHeap) {
        nextMaxHeap = depth;
      }
    }

    function moveToFallbackStack(atom: Atom) {
      const flags = atom.#flags;
      if (flags & ATOM_FLAG_IN_FALLBACK) return;
      atom.#flags = (flags & ATOM_FLAG_NON_DIRTY) | ATOM_FLAG_IN_FALLBACK;
      fallbackStack.push(atom);
    }

    let fallbackDepth = -1;
    function stabilizeFallback(rootAtom: Atom): undefined {
      fallbackDepth++;
      const linkStack: Link[] = [];
      const receiveStack: Atom[] = [];
      let link = (rootAtom.#state as Relay).sourceHead ?? undefined;
      let atom: Atom | undefined;
      while (link) {
        while (link) {
          atom = link.source;
          if (atom.#flags & ATOM_FLAG_OWNED) {
            if (atom.#flags >= ATOM_TYPE_DERIVE) {
              stabilizeFallback(owners.get(atom)!);
            } else {
              atom = owners.get(atom)!;
            }
          }
          const next: Link | undefined = link.nextSource ?? undefined;
          if (atom.#flags >= ATOM_TYPE_DERIVE) {
            const relay = (atom.#state as Relay);
            if (
              relay.depth < minHeap ||
              atom.#flags & (ATOM_FLAG_IN_RECEIVE | ATOM_FLAG_IN_FALLBACK)
            ) {
              // Skip atoms of stable depth, receiving, or already marked in fallback 
              link = next;
              continue;
            }
            if (atom.#flags & ATOM_FLAG_DIRTY) {
              receive(atom);
              moveToFallbackStack(atom);
              link = next;
              continue;
            }
            moveToFallbackStack(atom);
            receiveStack.push(atom);

            link = relay.sourceHead;
            if (link !== undefined) {
              if (next !== undefined) {
                linkStack.push(next);
              }
              continue;
            }
          }
          link = next;
        }
        link = linkStack.pop();
        for (let i = receiveStack.length - 1; i >= 0; i--) {
          const atom = receiveStack[i]!;
          if (atom.#flags & ATOM_FLAG_DIRTY) {
            receive(atom);
          }
        }
        receiveStack.length = 0;
      }
      if (rootAtom.#flags & ATOM_FLAG_DIRTY) {
        receive(rootAtom);
      }
      if (fallbackDepth === 0) {
        for (let i = fallbackStack.length - 1; i >= 0; i--) {
          const atom = fallbackStack[i]!;
          atom.#flags &= ATOM_FLAG_NON_FALLBACK;
        }
        fallbackStack.length = 0;
      }
      fallbackDepth--;
    }

    stabilize = function stabilize() {
      while (maxHeap >= 0) {
        let heap: Atom[] | undefined;
        let atom: Atom;
        for (
          heap = stabilizeHeaps[minHeap];
          minHeap <= maxHeap;
          heap = stabilizeHeaps[++minHeap]
        ) {
          if (heap === undefined) {
            continue;
          }
          for (let i = 0; i < heap.length; i++) {
            atom = heap[i]!;
            const relay = atom.#state as Relay;
            if (relay.depth !== minHeap) {
              moveHeap(atom);
              continue;
            }
            if (atom.#flags & ATOM_FLAG_DIRTY) {
              receive(atom);
            }
          }
          heap.length = 0;
        }
        maxHeap = nextMaxHeap;
        minHeap = maxHeap < 0 ? Infinity : 0;
        nextMaxHeap = -1;
      }
    }
  }
}

let recycledLinkPool: RecycledLink | undefined;
let dirtyRelayPool: Relay | undefined;

function scheduleRelayCleaning(relay: Relay) {
  if (relay.nextDirty !== undefined) {
    // Already scheduled
    return;
  }
  const sourcesTail = relay.sourceTail;
  if (
    (sourcesTail !== undefined
      ? sourcesTail.nextSource
      : relay.sourceHead) !== undefined
  ) {
    relay.nextDirty = dirtyRelayPool ?? relay;
    dirtyRelayPool = relay;
  }
}

export function clean(): undefined {
  const first = dirtyRelayPool;
  if (first === undefined) {
    return;
  }

  let receiver = first.nextDirty;
  first.nextDirty = undefined;

  if (receiver === first) {
    cleanRelay(receiver);
    dirtyRelayPool = undefined;
    return;
  }

  while (receiver !== undefined) {
    cleanRelay(receiver);

    dirtyRelayPool = receiver.nextDirty;
    receiver.nextDirty = undefined;
    receiver = dirtyRelayPool;
  }
}

export { stabilize };

/**
 * Create a mutable {@link Atom} and associated {@link Setter}
 * 
 * @example Usage
 * ```ts
 * const [count, setCount] = state(0);
 * setCount(count.unwrap() + 1);
 * ```
 */
export const state: <TValue>(initialValue: TValue) => [Atom<TValue>, Setter<TValue>] = Atom.createStateWithSetter.bind(Atom);

/**
 * Create a reactive {@link Atom} derived from the provided callback
 */
export const derive: <TValue>(derivation: (read: Reader) => TValue) => Atom<TValue> = Atom.createDerived.bind(Atom);

/**
 * Create a reactive {@link Atom} computed from the provided callback
 */
export const compute: <TValue>(computation: (this: Atom<never>, read: Reader) => TValue) => Atom<TValue> = Atom.createComputed.bind(Atom);
