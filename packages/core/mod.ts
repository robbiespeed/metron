export type AtomAccessor<TValue = unknown> = (read: Reader) => TValue;

export type Atomic<TValue = unknown> = Atom<TValue> | AtomAccessor<TValue>;

// deno-lint-ignore no-explicit-any
export type Source<TValue> = Atomic<TValue> | (TValue extends (...args: any[]) => unknown ? never : TValue);

export interface Reader {
  <TValue>(readable: Atom<TValue>): TValue;
  // <TValue>(readable: Atomic<TValue>): TValue;
  // <TValue>(readable: TValue):
  //   TValue extends (...args: any[]) => unknown ? never :
  //   TValue;
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

// TODO: Can I modify Relay to add back in static deps feature?
// Can Relay and Receiver be combined? Maybe if version is tracked by reader ref so it never overflows?
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

// TODO: Could alternatively try special #value wrapper for owned Atoms
// Yeah Map and more so WeakMap is incredibly slow
// Needs to be replaced either by explicit #owner or the wrapper for ownable Atoms
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
  // constructor (atom: Atom<TValue>) {
  //   if (flagsGet(atom) !== 0) {
  //     throw new Error("Atom is already initialized");
  //   }
  //   flagsSet(ATOM_TYPE_STATE);
  //   this.#atom = atom;
  // }
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
    // TODO maybe not needed if constructor accepts uninitialized Atom and initializes it as a state Atom
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


// let nextId = 0;
let heapCount = 0;

export class Atom<TValue = unknown> {
  // __id = nextId++;
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
        // TODO check ATOM_FLAG_IN_RECEIVE and throw
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
    // TODO not sure whether to do lazy or eager initialization
    // Lazy tends to hit fallback more unless it's made eager by the user in fan-in/out cases
    // Lazy also means that certain setups like creating the output children inside
    // the computed aren't available right away, so either manual eager computed.unwrap() or
    // restructuring to initialize children outside the computed is required
    // Could be an option defaulting to eager?
    // atom.#flags = ATOM_TYPE_COMPUTE | ATOM_FLAG_CAN_HEAP;
    // insertIntoHeap(atom);
    atom.#flags = ATOM_TYPE_COMPUTE | ATOM_FLAG_CAN_HEAP | ATOM_FLAG_DIRTY;
    heapCount++; // Because unwrap will reduce the count
    receive(atom);
    return atom;
  }
  // TODO:
  // Need createAsyncComputed with asyncReceive. Otherwise consumers will always dirty because Promise<T> !== Promise<T>.
  // asyncReceive should await the result and if it is different from oldVal the atom should transmit.
  // If the result fulfills before old result it should also transmit. Transmit should be block if the asyncReceive is not the current result.
  // Alternatively it could be up to memoization to handle this.
  // static createAsyncComputed<TValue>() { }

  // TODO
  // static createDerivedController<TValue>() { }
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
        // // TODO: Bench cost of this vs read.maybeRaw(v), read.polymorphic(v), or polyAtom(read, v)
        // switch (typeof atom) {
        //   case "function": return (atom as AtomAccessor)(read);
        //   case "object": {
        //     if (atom) {
        //       if (#flags in atom) {
        //         break;
        //       }
        //     }
        //     return atom;
        //   }
        //   default: return atom;
        // }
        if (atom.#flags & ATOM_FLAG_IN_RECEIVE) {
          throw new Error("Cannot read cyclicly");
        }
        if (atom.#flags & ATOM_FLAG_OWNED) {
          const owner = owners.get(atom)!;
          const ownerRelay = (owner.#state as Relay);
          // TODO this needs to recursively stabilize owner owners
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
        // TODO add back if/when disposal is added
        // if (
        //   relay.transmitAtom === undefined &&
        //   relay.reader === undefined
        // ) {
        //   relay.nextDirty = recycledRelayPool;
        //   recycledRelayPool = relay;
        // }
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

    // function deleteFromHeap(atom: ReceiveAtom) {
    //   const flags = atom.#flags;
    //   if (!(flags & ATOM_FLAG_IN_HEAP)) return;
    //   heapSize--;
    //   atom.#flags = flags & ATOM_FLAG_NON_HEAP;
    // }

    let fallbackDepth = -1;
    function stabilizeFallback(rootAtom: Atom): undefined {
      fallbackDepth++;
      // TODO: Remove log
      // console.warn("Stabilize Fallback");
      const linkStack: Link[] = [];
      const receiveStack: Atom[] = [];
      let link = (rootAtom.#state as Relay).sourceHead ?? undefined;
      let atom: Atom | undefined;
      while (link) {
        while (link) {
          atom = link.source;
          if (atom.#flags & ATOM_FLAG_OWNED) {
            if (atom.#flags >= ATOM_TYPE_DERIVE) {
              // TODO validate this works and if possible make it non recursive
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

// TODO try adding this back to use disposed Relays
// let recycledReceiverPool: Receiver | undefined;
// function createReceiver(atom: Atom | WeakRef<Atom>): Receiver {
//   if (recycledReceiverPool === undefined) {
//     return new Receiver(atom);
//   }
//   const receiver = recycledReceiverPool;
//   recycledReceiverPool = recycledReceiverPool.nextDirty;
//   receiver.transmitAtom = atom;
//   receiver.nextDirty = undefined;
//   return receiver;
// }

// function disposeReceiver(relay: Relay) {
//   const receiver = relay.receiver as Receiver | undefined;
//   if (receiver === undefined) {
//     return;
//   }
//   relay.receiver = undefined;
//   receiver.version++;
//   receiver.transmitAtom = undefined;
//   receiver.sourceTail = undefined;
//   receiver.scheduleCleaning();
//   // Likely bad perf if used with DEFER atoms or if deeper consumer atoms are weak themselves
//   // because it will still propagate down the tree, where as with only non-DEFER and strong atoms,
//   // they can be disposed in deep -> shallow order and since no receive happens in that disposal cascade
//   // the last atoms to be disposed have nothing to propagate too.
//   ///
//   // In either case if DEFER flag this should be insertIntoHeap instead of transmit 
//   // transmit(atom);

//   // An alternative could be to destroy the atom so it cannot be revived
//   // would be as simple as adding a DESTROYED flag
//   // This may be the way to go...
//   // Or possibly it's okay to allow revive it, without transmitting/heaping when it gets disposed
//   //
//   // An issue with either of these alternatives is it would allow weak receivers to be hijacked and forced to break
//   // by any part of the program that chooses to, by simply managing then disposing.
//   //
//   // Perhaps only specific kinds of atoms can be managed, and must be managed first before they become functional.
//   // This would be paired with the DESTROYED flag approach, rather than allowing revives.
//   // Maybe also taking an approach like Preact where effects (managed atoms in this case)
//   // trigger strongly holding all up stream sources
//   //
//   // Or all source -> consumer links are always weak
// }

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

// TODO can this be replaced with derived collections?

// TODO would a WeakAtomStateController be useful?
// It could simplify these kinds of collection item atoms (select, set.has(v), array.at(i), map.get(key))
// Alternatively a Ref type Atom (with static link to parent) would allow similar easy setup,
// and future hard source -> consumer links when leafs are subscribed
// a regular static derived would also work but take up more memory

export function selector<TKey>(input: Atom<TKey>): (key: TKey) => Atom<boolean> {
  const controllers = new WeakMap<Atom, AtomStateController<boolean>>();
  const atomRefs = new Map<TKey, WeakRef<Atom<boolean>>>();
  let activeKey: TKey | undefined;

  const projector = compute((read) => {
    const nextKey = read(input);
    if (activeKey !== nextKey) {
      controllers.get(atomRefs.get(activeKey!)?.deref()!)?.setState(false);
      controllers.get(atomRefs.get(nextKey)?.deref()!)?.setState(true);
      activeKey = nextKey;
    }
  });

  const finalizer = new FinalizationRegistry<TKey>((key) => {
    atomRefs.delete(key);
  });

  const select = (key: TKey): Atom<boolean> => {
    let atomRef = atomRefs.get(key);
    let atom = atomRef?.deref();
    if (atom === undefined) {
      if (atomRef) {
        finalizer.unregister(atomRef);
      }
      const controller = Atom.createStateController(key === activeKey);
      controller.setOwner(projector);
      atom = controller.atom;
      atomRef = new WeakRef(atom);
      controllers.set(atom, controller);
      atomRefs.set(key, atomRef);
      finalizer.register(atom, key, atomRef);
      return atom;
    }

    return atom;
  };

  return select;
}


// TODO how to deal with nested collections? Ex: AtomArray<AtomArray<number>>
// If one does `outer.at(0)` that is a wrapper around the inner array of type Atom<AtomArray<number>>
// how would one use the inner array inside a map operation, or otherwise gain access to it's ChangeStore?
// Maybe `(read) => read(outer.at(0)).map((v) => v * 2)`?