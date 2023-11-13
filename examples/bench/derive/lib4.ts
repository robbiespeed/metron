interface OrbLink {
  consumer: WeakRef<Orb<any>>;
  consumerId: string;
  consumerVersion: number;
  source: WeakRef<Orb<any>>;
  sourceConsumerSlot: number;
}

export interface Disposer {
  (): void;
}

interface LinkArray extends Array<OrbLink> {}
interface LinkRecord extends Record<string, OrbLink> {}

interface PolyOrb<TData> {
  readonly id: string;
  readonly weakRef: WeakRef<this>;
  readonly isTransmitter: boolean;
  readonly isReceiver: boolean;
  data: TData;
}

export interface TransmitterOrb<TData = unknown> extends PolyOrb<TData> {
  readonly isTransmitter: true;
}

export interface ReceiverOrb<TData = unknown> extends PolyOrb<TData> {
  readonly isReceiver: true;
}

export interface TransceiverOrb<TData = unknown> extends PolyOrb<TData> {
  readonly isTransmitter: true;
  readonly isReceiver: true;
}

export interface RelayOrb<TData = unknown> extends TransceiverOrb<TData> {}

let canScheduleLinkTrim = true;
let scheduledNodeSourceTrims = new Set<WeakRef<Orb<any>>>();

const afterTransmitQueue: (() => void)[] = [];

let nextIdNum = 0n;
const emptyArray = Object.freeze([]) as [];
const emptySourceLinks: LinkRecord = Object.freeze(Object.create(null));

function removeLinkFromConsumerLinks(link: OrbLink, links: LinkArray) {
  const sourceConsumerLastSlot = links.length - 1;

  if (sourceConsumerLastSlot > 0) {
    // swap last consumer to slot of link to remove
    const removedLinkSlot = link.sourceConsumerSlot;
    const swappedLink = links[sourceConsumerLastSlot]!;
    swappedLink.sourceConsumerSlot = removedLinkSlot;
    links[removedLinkSlot] = swappedLink;
    links.length = sourceConsumerLastSlot;
  } else {
    links.length = 0;
  }
}

const MAX_VERSION = Number.MAX_SAFE_INTEGER;

const ORB_FLAG_TRANSMIT = 0b0001 as const;
const ORB_FLAG_RECEIVE = 0b0010 as const;

function defaultIntercept() {
  return true;
}

export class Orb<TData> {
  #id = `s${nextIdNum++}`;
  #version = 0;
  #weakRef: WeakRef<this> = new WeakRef(this);
  #sourceLinks: LinkRecord = emptySourceLinks;
  #consumerLinks: LinkArray = emptyArray;
  #intercept: (this: this) => boolean;
  #flags = 0b0;
  data: TData;

  get id() {
    return this.#id;
  }
  get weakRef() {
    return this.#weakRef;
  }
  get isTransmitter() {
    return !(this.#flags & ORB_FLAG_TRANSMIT);
  }
  get isReceiver() {
    return !(this.#flags & ORB_FLAG_RECEIVE);
  }

  private constructor(data?: any, intercept?: (this: Orb<any>) => boolean) {
    this.data = data;
    this.#intercept = intercept ?? defaultIntercept;
  }

  #safeIntercept(): boolean {
    try {
      return this.#intercept();
    } catch (err) {
      // TODO: dev mode log
      // TODO: emit global uncaught exception event
      return false;
    }
  }

  #rollVersion() {
    this.#version = 0;
    const sourceLinks = this.#sourceLinks;
    if (sourceLinks === emptySourceLinks) {
      return;
    }
    for (const sourceId in sourceLinks) {
      const link = sourceLinks[sourceId];
      const source = link.source.deref();

      if (source !== undefined) {
        removeLinkFromConsumerLinks(link, source.#consumerLinks);
      }
    }
    this.#sourceLinks = Object.create(null);
  }

  static link(consumer: ReceiverOrb<any>, source: TransmitterOrb<any>): void {
    const sourceLinks = (consumer as Orb<any>).#sourceLinks;

    const sourceId = (source as Orb<any>).#id;

    const existingLink = sourceLinks[sourceId];

    if (existingLink !== undefined) {
      existingLink.consumerVersion = (consumer as Orb<any>).#version;
      return;
    }

    const sourceConsumers = (source as Orb<any>).#consumerLinks;

    const link: OrbLink = {
      consumer: (consumer as Orb<any>).#weakRef,
      consumerId: (consumer as Orb<any>).#id,
      consumerVersion: (consumer as Orb<any>).#version,
      source: (source as Orb<any>).#weakRef,
      sourceConsumerSlot: sourceConsumers.length,
    };

    try {
      sourceConsumers.push(link);
      sourceLinks[sourceId] = link;
    } catch {
      throw new Error('Either orb cannot receive, or source cannot transmit');
    }
  }

  // TODO: make static:
  // getSources(): Orb<unknown>[] {
  //   throw notImplemented();
  // }

  // getSourceCount(): number {
  //   throw notImplemented();
  // }

  // getConsumers(): Orb<unknown>[] {
  //   throw notImplemented();
  // }

  // getConsumerCount(): number {
  //   throw notImplemented();
  // }

  static #trimNodeSourceLinks(this: void, orb: Orb<any>): void {
    const version = orb.#version;
    const sourceLinks = orb.#sourceLinks;
    for (const sourceId in sourceLinks) {
      const link = sourceLinks[sourceId];
      const source = link.source.deref();

      if (source === undefined) {
        delete sourceLinks[sourceId];
      } else if (link.consumerVersion < version) {
        delete sourceLinks[sourceId];
        removeLinkFromConsumerLinks(link, source.#consumerLinks);
      }
    }
  }

  static #trimScheduledLinks(this: void): void {
    const trimSourceLinks = Orb.#trimNodeSourceLinks;
    for (const ref of scheduledNodeSourceTrims) {
      const orb = ref.deref();
      if (orb) {
        trimSourceLinks(orb);
      }
    }
    scheduledNodeSourceTrims = new Set();

    canScheduleLinkTrim = true;
  }

  static #scheduleTrimLinks(): void {
    if (canScheduleLinkTrim) {
      canScheduleLinkTrim = false;
      queueMicrotask(this.#trimScheduledLinks);
    }
  }

  static #propagate(consumers: LinkArray): void {
    const propagatedNodeIds = new Set<string>();
    let links = consumers;
    const linkStack: LinkArray[] = [];
    let i = links.length - 1;
    while (i >= 0) {
      const link = links[i]!;

      if (!propagatedNodeIds.has(link.consumerId)) {
        const consumerRef = link.consumer;
        const consumer = consumerRef.deref();

        if (consumer !== undefined) {
          const versionBefore = consumer.#version;
          if (link.consumerVersion >= versionBefore) {
            propagatedNodeIds.add(link.consumerId);
            if (consumer.#safeIntercept()) {
              if (++consumer.#version >= MAX_VERSION) {
                consumer.#rollVersion();
              } else {
                scheduledNodeSourceTrims.add(consumerRef);
              }

              const consumerConsumers = consumer.#consumerLinks;
              if (consumerConsumers.length) {
                if (i > 0) {
                  linkStack.push(consumerConsumers);
                } else {
                  links = consumerConsumers;
                  i = consumerConsumers.length - 1;
                  continue;
                }
              }
            }
          }
        } else {
          removeLinkFromConsumerLinks(link, links);
        }
      }

      i--;
      if (i < 0) {
        const nextLinks = linkStack.pop();
        if (nextLinks) {
          links = nextLinks;
          i = links.length - 1;
        }
      }
    }
  }

  static #transmit(this: Orb<any>) {
    if (this.#safeIntercept()) {
      if (++this.#version >= MAX_VERSION) {
        this.#rollVersion();
      }
      const consumerLinks = this.#consumerLinks;

      if (consumerLinks.length) {
        Orb.#propagate(consumerLinks);
        Orb.#scheduleTrimLinks();
      }
    }

    if (afterTransmitQueue.length) {
      for (let i = 0; i < afterTransmitQueue.length; i++) {
        try {
          afterTransmitQueue[i]();
        } catch (err) {
          // TODO: emit uncaught err to global
        }
      }
      afterTransmitQueue.length = 0;
    }
  }

  static #registerStaticSources(orb: Orb<any>, staticSources: Orb<any>[]) {
    const consumer = orb.#weakRef;
    const consumerId = orb.#id;
    const consumerVersion = Infinity;

    try {
      for (const source of staticSources) {
        const links = source.#consumerLinks;
        links.push({
          consumer,
          consumerId,
          consumerVersion,
          source: source.#weakRef,
          sourceConsumerSlot: links.length,
        });
      }
    } catch {
      throw new Error('Expected array of transmitter orbs');
    }
  }

  static createTransmitter(): {
    orb: TransmitterOrb<void>;
    transmit: () => void;
  };
  static createTransmitter<TData>(
    data: TData,
    intercept?: (this: Orb<TData>) => boolean
  ): {
    orb: TransmitterOrb<TData>;
    transmit: () => void;
  };
  static createTransmitter<TData>(
    data?: TData,
    intercept?: (this: Orb<TData>) => boolean
  ): {
    orb: TransmitterOrb<TData>;
    transmit: () => void;
  } {
    const orb = new Orb<TData>(data, intercept);
    orb.#consumerLinks = [];
    orb.#flags |= ORB_FLAG_TRANSMIT;

    return {
      orb: orb as TransmitterOrb<TData>,
      transmit: this.#transmit.bind(orb),
    };
  }
  static createRelay<TData>(
    data: TData,
    intercept: (this: Orb<TData>) => boolean,
    staticSources?: TransmitterOrb<any>[]
  ): RelayOrb<TData> {
    const orb = new Orb<TData>(data, intercept);
    orb.#consumerLinks = [];
    orb.#sourceLinks = Object.create(null);
    orb.#flags |= ORB_FLAG_TRANSMIT | ORB_FLAG_RECEIVE;

    if (staticSources !== undefined) {
      Orb.#registerStaticSources(orb, staticSources as Orb<any>[]);
    }

    return orb as RelayOrb<TData>;
  }
  static createReceiver<TData>(
    data: TData,
    intercept: (this: Orb<TData>) => boolean,
    staticSources?: TransmitterOrb<any>[]
  ): ReceiverOrb<TData> {
    const orb = new Orb<TData>(data, intercept);
    orb.#sourceLinks = Object.create(null);
    orb.#flags |= ORB_FLAG_RECEIVE;

    if (staticSources !== undefined) {
      Orb.#registerStaticSources(orb, staticSources as Orb<any>[]);
    }

    return orb as ReceiverOrb<TData>;
  }
  static createTransceiver<TData>(
    data: TData,
    intercept: (this: Orb<TData>) => boolean,
    staticSources?: TransmitterOrb<any>[]
  ): {
    orb: TransceiverOrb<TData>;
    transmit: () => void;
  } {
    const orb = new Orb<TData>(data, intercept);
    orb.#consumerLinks = [];
    orb.#sourceLinks = Object.create(null);
    orb.#flags |= ORB_FLAG_TRANSMIT | ORB_FLAG_RECEIVE;

    if (staticSources !== undefined) {
      Orb.#registerStaticSources(orb, staticSources as Orb<any>[]);
    }

    return {
      orb: orb as TransceiverOrb<TData>,
      transmit: this.#transmit.bind(orb),
    };
  }
  static queueAfterTransmit(callback: () => void) {
    afterTransmitQueue.push(callback);
  }
}

// Not part of core:

export const EMITTER = Symbol('Emitter');

export interface EmitMessage<TType extends string = string, TData = unknown> {
  readonly type: TType;
  readonly data: TData;
}

export type EmitMessageOption = void | EmitMessage;

export interface SubscriptionHandler<TEmit extends EmitMessageOption> {
  (message: TEmit): void;
}

interface Subscription<TEmit extends EmitMessageOption> {
  handler: SubscriptionHandler<TEmit>;
  next?: Subscription<TEmit>;
  prev?: Subscription<TEmit>;
}

export interface Subscribable<TEmit extends EmitMessageOption> {
  subscribe(handler: (message: TEmit) => void): Disposer;
}

const scheduledEmits: { emitter: Emitter<any>; message: EmitMessageOption }[] =
  [];

export class Emitter<TEmit extends EmitMessageOption>
  implements Subscribable<TEmit>
{
  #subscriptionHead?: Subscription<TEmit>;
  subscribe(handler: SubscriptionHandler<TEmit>): Disposer {
    const subHead = this.#subscriptionHead;
    let sub: Subscription<TEmit> | undefined = {
      prev: undefined,
      handler,
      next: subHead,
    };
    if (subHead) {
      subHead.prev = sub;
    }
    this.#subscriptionHead = sub;

    return () => {
      if (sub !== undefined) {
        if (sub.prev) {
          sub.prev = sub.next;
        } else {
          this.#subscriptionHead = sub.next;
        }
        sub = undefined;
      }
    };
  }
  #emit(message: TEmit): void {
    let next = this.#subscriptionHead;
    while (next) {
      try {
        next.handler(message);
      } catch (err) {
        // TODO: dev mode log
      }
      next = next.next;
    }
  }
  #scheduleEmit(message: TEmit): void {
    scheduledEmits.push({ emitter: this, message });
  }
  static runScheduled() {
    for (let i = 0; i < scheduledEmits.length; i++) {
      const { emitter, message } = scheduledEmits[i];
      emitter.#emit(message);
    }
    scheduledEmits.length = 0;
  }
  static create<TEmit extends EmitMessageOption = void>(): {
    emitter: Emitter<TEmit>;
    emit(message: TEmit): void;
  } {
    const emitter = new Emitter<TEmit>();
    return { emitter, emit: emitter.#scheduleEmit.bind(emitter) };
  }
}

export const runScheduledEmits = Emitter.runScheduled;

export const createEmitter = Emitter.create;

export const ORB = Symbol('Orb');

export interface Atom<TValue> {
  readonly [ORB]: TransmitterOrb<unknown>;
  readonly [EMITTER]: Emitter<void>;
  unwrap(): TValue;
}

const emptyTransmit = () => {};

export class StateAtom<T> implements Atom<T> {
  #orb?: TransmitterOrb<void>;
  #transmit: () => void = emptyTransmit;
  #emitter?: Emitter<void>;
  #emit = emptyTransmit;
  #store: T;
  private constructor(initialValue: T) {
    this.#store = initialValue;
  }
  #set(value: T): void {
    if (value === this.#store) {
      return;
    }
    this.#store = value;
    this.#emit();
    this.#transmit();
  }
  get [EMITTER](): Emitter<void> {
    const existingEmitter = this.#emitter;
    if (existingEmitter !== undefined) {
      return existingEmitter;
    }

    const { emitter, emit } = Emitter.create();

    this.#emitter = emitter;
    this.#emit = emit;

    return emitter;
  }
  get [ORB](): TransmitterOrb<unknown> {
    const existingNode = this.#orb;
    if (existingNode !== undefined) {
      return existingNode;
    }

    const { orb, transmit } = Orb.createTransmitter();
    this.#orb = orb;
    this.#transmit = transmit;

    return orb;
  }
  unwrap(): T {
    return this.#store;
  }
  static create<T>(initialValue: T): [StateAtom<T>, (value: T) => void] {
    const ref = new StateAtom(initialValue);
    return [ref, ref.#set.bind(ref)];
  }
}

export const state = StateAtom.create;
export const createAtom = StateAtom.create;

export class MappedAtom<T, U> implements Atom<U> {
  #input: Atom<T>;
  #mapper: (inputValue: T) => U;
  constructor(input: Atom<T>, mapper: (inputValue: T) => U) {
    this.#input = input;
    this.#mapper = mapper;
  }
  get [EMITTER]() {
    return this.#input[EMITTER];
  }
  get [ORB](): TransmitterOrb<unknown> {
    return this.#input[ORB];
  }
  unwrap(): U {
    return this.#mapper(this.#input.unwrap());
  }
}

export function map<T, U>(
  input: Atom<T>,
  mapper: (inputValue: T) => U
): Atom<U> {
  return new MappedAtom(input, mapper);
}

export const cacheInvalid = Symbol();

interface AtomReader {
  <T>(atom: Atom<T>): T;
}

const orbLink = Orb.link;

function bindableRead<T>(this: ReceiverOrb<any>, atom: Atom<T>): T {
  orbLink(this, atom[ORB]);
  return atom.unwrap();
}

export class Derived<TValue> implements Atom<TValue> {
  #orb: RelayOrb<Derived<TValue>>;
  #emitter?: Emitter<void>;
  #emit = emptyTransmit;
  #store: TValue | typeof cacheInvalid = cacheInvalid;
  #derive: (read: AtomReader) => TValue;
  #read: AtomReader;
  constructor(
    derive: (this: Derived<TValue>, read: AtomReader) => TValue,
    sourceOrbs?: TransmitterOrb<any>[]
  ) {
    const orb = Orb.createRelay(
      this as Derived<TValue>,
      Derived.#intercept,
      sourceOrbs
    );
    // const read = bindableRead.bind(orb) as AtomReader;
    this.#read = bindableRead.bind(orb) as AtomReader;
    // const read: AtomReader = (atom) => (orbLink(orb, atom[ORB]), atom.unwrap());
    this.#orb = orb;
    // atom.#deriver = derive.bind(undefined, read);
    this.#derive = derive;
  }
  get [EMITTER](): Emitter<void> {
    const existingEmitter = this.#emitter;
    if (existingEmitter !== undefined) {
      return existingEmitter;
    }

    const { emitter, emit } = Emitter.create();

    this.#emitter = emitter;
    this.#emit = emit;

    return emitter;
  }
  get [ORB](): TransmitterOrb<unknown> {
    return this.#orb;
  }
  unwrap(): TValue {
    const current = this.#store;
    if (current === cacheInvalid) {
      return (this.#store = this.#derive(this.#read));
    }
    return current;
  }
  static #intercept(this: Orb<Derived<any>>) {
    const derived = this.data;
    if (derived.#store === cacheInvalid) {
      return false;
    }
    derived.#store = cacheInvalid;
    derived.#emit();
    return true;
  }
  static create<TValue>(
    derive: (this: Derived<TValue>, read: AtomReader) => TValue
  ): Atom<TValue> {
    // const atom = new Derived<TValue>(TOKEN);
    // const orb = Orb.createRelay(atom, Derived.#intercept);
    // const read = bindableRead.bind(orb) as AtomReader;
    // atom.#read = read;
    // // const read: AtomReader = (atom) => (orbLink(orb, atom[ORB]), atom.unwrap());
    // atom.#orb = orb;
    // // atom.#deriver = derive.bind(undefined, read);
    // atom.#deriver = derive;
    // return atom;
    return new Derived(derive);
  }
  static createFromSources<TValue>(
    sources: Atom<any>[],
    derive: (this: Derived<TValue>, read: AtomReader) => TValue
  ): Atom<TValue> {
    // const atom = new Derived<TValue>(TOKEN);
    const sourceOrbs = sources.map((atom) => atom[ORB]);
    // const orb = Orb.createRelay<any>(atom, Derived.#intercept, sourceOrbs);
    // const read = bindableRead.bind(orb) as AtomReader;
    // atom.#read = read;
    // atom.#orb = orb;
    // atom.#deriver = derive;
    // return atom;
    return new Derived(derive, sourceOrbs);
  }
}

function notImplemented() {
  return new Error('Not Implemented');
}

export const derivedFromSources = Derived.createFromSources;
export const derived = Derived.create;
export const computed = Derived.create;

// // @ts-ignore
// const isSelected: Atom<true | undefined> = selections.get(id);
// derived([isSelected], (read) => read(isSelected) === true ? "danger" : "");
// computed((read) => read(isSelected) === true ? "danger" : "");

// interface SourceLinker {
//   linkSource(orb: TransmitterOrb<any>): void;
// }

interface AsyncAtom<TValue> extends Atom<Promise<TValue>> {
  then(): Promise<Atom<Awaited<TValue>>>;
  then<TResult = Atom<Awaited<TValue>>, TResultFallback = never>(
    handleResolve?:
      | ((value: Atom<Awaited<TValue>>) => TResult | PromiseLike<TResult>)
      | null
      | undefined,
    handleReject?:
      | ((cause: unknown) => PromiseLike<TResultFallback>)
      | null
      | undefined
  ): Promise<Awaited<TResult | TResultFallback>>;
  // result(): Atom<Awaited<TValue> | undefined>;
  // rejection(): Atom<unknown>;
  // state(): Atom<"awaiting" | "empty" | "resolved" | "rejected">;
}

class AwaitedAtom<TValue> implements Atom<Awaited<TValue>> {
  #orb: TransmitterOrb<AwaitedAtom<TValue>>;
  #transmit!: () => void;
  #emitter?: Emitter<void>;
  #emit = emptyTransmit;
  #store: Awaited<TValue>;
  #isSyncing = false;
  #input: Atom<TValue> | AsyncAtom<TValue>;
  constructor(input: Atom<TValue>, initial: Awaited<TValue>) {
    this.#store = initial;
    this.#input = input;
    const { orb, transmit } = Orb.createTransceiver<any>(
      this as AwaitedAtom<TValue>,
      AwaitedAtom.#intercept,
      [input[ORB]]
    );
    this.#orb = orb;
    this.#transmit = transmit;
  }
  get [EMITTER](): Emitter<void> {
    const existingEmitter = this.#emitter;
    if (existingEmitter !== undefined) {
      return existingEmitter;
    }

    const { emitter, emit } = Emitter.create();

    this.#emitter = emitter;
    this.#emit = emit;

    return emitter;
  }
  get [ORB](): TransmitterOrb<unknown> {
    return this.#orb;
  }
  unwrap(): Awaited<TValue> {
    return this.#store;
  }
  async #sync() {
    // Ensure only one sync is in progress at a time
    if (this.#isSyncing) {
      return;
    }
    this.#isSyncing = true;

    this.#store = await this.#input.unwrap();

    this.#isSyncing = false;

    this.#emit();
    this.#transmit();
  }
  static #intercept(this: Orb<AwaitedAtom<any>>): boolean {
    this.data.#sync();
    return false;
  }
}

function emptyFn() {}

function disposeBucket(this: Disposer[]) {
  for (let i = 0; i < this.length; i++) {
    try {
      this[i]();
    } catch (err) {
      // TODO: emit uncaught err to global
    }
  }
  this.length = 0;
}

const arrayPush = Array.prototype.push;

function createDisposerBucket() {
  const disposers: Disposer[] = [];
  return {
    dispose: disposeBucket.bind(disposers),
    addDisposers: arrayPush.bind(disposers),
  };
}

export class AsyncDerived<TValue> implements AsyncAtom<TValue> {
  #orb: RelayOrb<AsyncDerived<TValue>>;
  #emitter?: Emitter<void>;
  #emit = emptyTransmit;
  #store: Promise<TValue> | TValue | typeof cacheInvalid = cacheInvalid;
  #read: AtomReader;
  #awaitedAtom?: WeakRef<AwaitedAtom<TValue>>;
  #comp: (
    read: AtomReader,
    addDisposers: (...disposers: Disposer[]) => void
  ) => Promise<TValue> | TValue;
  #dispose = emptyFn;
  #addDisposers = AsyncDerived.#addDisposersInit.bind(this);
  constructor(
    comp: (this: AsyncDerived<TValue>, read: AtomReader) => Promise<TValue>
  ) {
    this.#comp = comp;
    const orb = Orb.createRelay<AsyncDerived<TValue>>(
      this,
      AsyncDerived.#intercept
    );
    this.#read = bindableRead.bind(orb) as AtomReader;
    this.#orb = orb;
  }
  get [EMITTER](): Emitter<void> {
    const existingEmitter = this.#emitter;
    if (existingEmitter !== undefined) {
      return existingEmitter;
    }

    const { emitter, emit } = Emitter.create();

    this.#emitter = emitter;
    this.#emit = emit;

    return emitter;
  }
  get [ORB](): TransmitterOrb<unknown> {
    return this.#orb;
  }
  #innerUnwrap(): Promise<TValue> | TValue {
    const current = this.#store;
    if (current !== cacheInvalid) {
      return current;
    }

    let isDisposed = false;
    const _read = this.#read;
    const read: AtomReader = (atom) => {
      if (isDisposed) {
        // TODO: msg
        throw new Error();
      }
      return _read(atom);
    };

    const addDisposers = this.#addDisposers;
    addDisposers(() => {
      isDisposed = true;
    });

    const promise = this.#comp(read, addDisposers);
    this.#store = promise;

    return promise;
  }
  async unwrap(): Promise<TValue> {
    while (true) {
      const promise = this.#innerUnwrap();
      try {
        const result = await promise;
        if (promise === this.#store) {
          return result;
        }
      } catch (cause) {
        if (promise === this.#store) {
          throw cause;
        }
      }
    }
  }
  then(): Promise<Atom<Awaited<TValue>>>;
  then<TResult = Atom<Awaited<TValue>>, TResultFallback = never>(
    handleResolve?:
      | ((value: Atom<Awaited<TValue>>) => TResult | PromiseLike<TResult>)
      | null
      | undefined,
    handleReject?:
      | ((cause: unknown) => PromiseLike<TResultFallback>)
      | null
      | undefined
  ): Promise<Awaited<TResult | TResultFallback>>;
  async then(
    handleResolve?: null | ((value: Atom<Awaited<TValue>>) => unknown),
    handleReject?: null | ((cause: unknown) => unknown)
  ) {
    try {
      let awaitedAtom = this.#awaitedAtom?.deref();
      if (awaitedAtom === undefined) {
        let result: Awaited<TValue>;
        while (true) {
          const promise = this.#innerUnwrap();
          try {
            result = await promise;
            if (promise === this.#store) {
              break;
            }
          } catch (cause) {
            if (promise === this.#store) {
              throw cause;
            }
          }
        }
        awaitedAtom = new AwaitedAtom(this, result) as AwaitedAtom<TValue>;
        this.#awaitedAtom = new WeakRef(awaitedAtom);
      }
      return handleResolve == undefined
        ? awaitedAtom
        : await handleResolve(awaitedAtom);
    } catch (err) {
      if (handleReject != undefined) {
        return handleReject(err);
      }
      throw err;
    }
  }
  static #addDisposersInit(this: AsyncDerived<any>, ...disposers: Disposer[]) {
    let addDisposers = this.#addDisposers;
    if (this.#dispose === emptyFn) {
      const bucket = createDisposerBucket();
      addDisposers = bucket.addDisposers;
      this.#dispose = bucket.dispose;
      this.#addDisposers = addDisposers;
    }
    addDisposers(...disposers);
  }
  static #intercept(this: Orb<AsyncDerived<any>>): boolean {
    const computed = this.data;
    if (computed.#store === cacheInvalid) {
      return false;
    }
    computed.#dispose();
    computed.#store = cacheInvalid;
    computed.#emit();
    return true;
  }
}

// interface DefferedValue <TValue> {

// }

// class DeferredDerived <TValue> implements Atom<> {

// }

const scheduled: Effect[] = [];

export class Effect {
  #read: AtomReader;
  #innerRun: (read: AtomReader) => void;
  #canSchedule = false;
  constructor(run: (read: AtomReader) => void) {
    const orb = Orb.createReceiver<Effect>(this, Effect.#intercept);
    this.#read = bindableRead.bind(orb) as AtomReader;
    this.#innerRun = run;
    scheduled.push(this);
  }
  #run() {
    this.#innerRun(this.#read);
    this.#canSchedule = true;
  }
  dispose() {
    this.#canSchedule = false;
  }
  static runScheduled() {
    for (let index = 0; index < scheduled.length; index++) {
      scheduled[index].#run();
    }
    scheduled.length = 0;
  }
  static #intercept(this: Orb<Effect>): boolean {
    const effect = this.data;
    if (effect.#canSchedule) {
      effect.#canSchedule = false;
      scheduled.push(effect);
      return true;
    }
    return false;
  }
}

export const runScheduledEffects = Effect.runScheduled;
