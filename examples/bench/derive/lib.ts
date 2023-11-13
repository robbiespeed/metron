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

interface BaseOrb<TData> {
  readonly id: string;
  readonly weakRef: WeakRef<this>;
  data: TData;
}

export interface TransmitterOrb<TData> extends BaseOrb<TData> {}

export interface ReceiverOrb<TData> extends BaseOrb<TData> {
  linkSource(orb: TransmitterOrb<any>, isDynamic?: boolean): void;
}

export interface RelayOrb<TData>
  extends TransmitterOrb<TData>,
    ReceiverOrb<TData> {}

export interface TransceiverOrb<TData>
  extends TransmitterOrb<TData>,
    ReceiverOrb<TData> {}

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
  data: TData;

  get id() {
    return this.#id;
  }
  get weakRef() {
    return this.#weakRef;
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

  linkSource(source: TransmitterOrb<any>): void {
    const sourceLinks = this.#sourceLinks;

    const sourceId = (source as Orb<any>).#id;

    const existingLink = sourceLinks[sourceId];

    if (existingLink !== undefined) {
      existingLink.consumerVersion = this.#version;
      return;
    }

    const sourceConsumers = (source as Orb<any>).#consumerLinks;

    const link: OrbLink = {
      consumer: this.#weakRef,
      consumerId: this.#id,
      consumerVersion: this.#version,
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
        afterTransmitQueue[i]();
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
  ) {
    const orb = new Orb<TData>(data, intercept);
    orb.#consumerLinks = [];

    return { orb, transmit: this.#transmit.bind(orb) };
  }
  static createRelay<TData>(
    data: TData,
    intercept: (this: Orb<TData>) => boolean,
    staticSources?: TransmitterOrb<any>[]
  ): RelayOrb<TData> {
    const orb = new Orb<TData>(data, intercept);
    orb.#consumerLinks = [];
    orb.#sourceLinks = Object.create(null);

    if (staticSources !== undefined) {
      Orb.#registerStaticSources(orb, staticSources as Orb<any>[]);
    }

    return orb;
  }
  static createReceiver<TData>(
    data: TData,
    intercept: (this: Orb<TData>) => boolean,
    staticSources?: TransmitterOrb<any>[]
  ): ReceiverOrb<TData> {
    const orb = new Orb<TData>(data, intercept);
    orb.#sourceLinks = Object.create(null);

    if (staticSources !== undefined) {
      Orb.#registerStaticSources(orb, staticSources as Orb<any>[]);
    }

    return orb;
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

    if (staticSources !== undefined) {
      Orb.#registerStaticSources(orb, staticSources as Orb<any>[]);
    }

    return { orb, transmit: this.#transmit.bind(orb) };
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

// TODO: Rename to Orb
export const ORB = Symbol('Signal');

export interface Atom<TValue> {
  [ORB]: TransmitterOrb<unknown>;
  [EMITTER]: Emitter<void>;
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

export class Derived<TValue> implements Atom<TValue> {
  #orb: RelayOrb<this>;
  #emitter?: Emitter<void>;
  #emit = emptyTransmit;
  #store: TValue | typeof cacheInvalid = cacheInvalid;
  #deriver: (orb: RelayOrb<this>) => TValue;
  constructor(
    inputs: Atom<unknown>[],
    deriver: (orb: RelayOrb<unknown>) => TValue
  ) {
    this.#deriver = deriver;
    const inputNodes = inputs.map((atom) => atom[ORB]);
    this.#orb = Orb.createRelay<any>(this, Derived.#intercept, inputNodes);
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
      return (this.#store = this.#deriver(this.#orb));
    }
    return current;
  }
  subscribe(_handler: () => void): Disposer {
    return () => {};
  }
  static #intercept(this: RelayOrb<Derived<unknown>>) {
    const derived = this.data;
    if (derived.#store === cacheInvalid) {
      return false;
    }
    derived.#store = cacheInvalid;
    derived.#emit();
    return true;
  }
}

function notImplemented() {
  return new Error('Not Implemented');
}

export function derived<T>(inputs: Atom<unknown>[], deriver: () => T): Atom<T> {
  return new Derived(inputs, deriver);
}

// // @ts-ignore
// const isSelected: Atom<true | undefined> = selections.get(id);
// derived([isSelected], (read) => read(isSelected) === true ? "danger" : "");
// computed((read) => read(isSelected) === true ? "danger" : "");

interface SourceLinker {
  linkSource(orb: TransmitterOrb<any>): void;
}

function read<T>(this: SourceLinker, atom: Atom<T>): T {
  this.linkSource(atom[ORB]);
  return atom.unwrap();
}

export class Computed<T> implements Atom<T> {
  #orb: RelayOrb<this>;
  #emitter?: Emitter<void>;
  #read: AtomReader;
  #emit = emptyTransmit;
  #store: T | typeof cacheInvalid = cacheInvalid;
  #comp: (read: AtomReader) => T;
  constructor(comp: (read: AtomReader) => T) {
    this.#comp = comp;
    const orb = Orb.createRelay<any>(this, Computed.#intercept);
    this.#orb = orb;
    this.#read = read.bind(orb) as AtomReader;
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
  unwrap(): T {
    const current = this.#store;
    if (current === cacheInvalid) {
      return (this.#store = this.#comp(this.#read));
    }
    return current;
  }
  static #intercept(this: RelayOrb<Computed<unknown>>): boolean {
    const computed = this.data;
    if (computed.#store === cacheInvalid) {
      return false;
    }
    computed.#store = cacheInvalid;
    computed.#emit();
    return true;
  }
}

export function computed<T>(compute: (read: AtomReader) => T): Computed<T> {
  return new Computed(compute);
}

interface AsyncAtom<T> extends Atom<Promise<T>> {
  then<TResult = Atom<Awaited<T>>, TResultFallback = never>(
    handleResolve?:
      | ((value: Atom<Awaited<T>>) => TResult | PromiseLike<TResult>)
      | null
      | undefined,
    handleReject?:
      | ((reason: unknown) => PromiseLike<TResultFallback>)
      | null
      | undefined
  ): Promise<Awaited<TResult | TResultFallback>>;
}

class AwaitedAtom<T> implements Atom<Awaited<T>> {
  #orb: TransmitterOrb<this>;
  #transmit!: () => void;
  #emitter?: Emitter<void>;
  #emit = emptyTransmit;
  #store: Awaited<T>;
  #isSyncing = false;
  #input: Atom<T> | AsyncAtom<T>;
  constructor(input: Atom<T>, initial: Awaited<T>) {
    this.#store = initial;
    this.#input = input;
    const { orb, transmit } = Orb.createTransceiver<any>(
      this,
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
  unwrap(): Awaited<T> {
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
  static #intercept(this: RelayOrb<AwaitedAtom<unknown>>): boolean {
    this.data.#sync();
    return false;
  }
}

function emptyFn() {}

function disposeBucket(this: Disposer[]) {
  for (let i = 0; i < this.length; i++) {
    this[i]();
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

export class AsyncComputed<T> implements AsyncAtom<T> {
  #orb: RelayOrb<this>;
  #emitter?: Emitter<void>;
  #sourceLinker?: SourceLinker;
  #emit = emptyTransmit;
  #store: Promise<T> | typeof cacheInvalid = cacheInvalid;
  #awaitedAtom?: WeakRef<AwaitedAtom<T>>;
  #comp: (
    read: AtomReader,
    addDisposers: (...disposers: Disposer[]) => void
  ) => Promise<T>;
  #dispose = emptyFn;
  #addDisposers = AsyncComputed.#addDisposersInit.bind(this);
  constructor(comp: (this: AsyncComputed<T>, read: AtomReader) => Promise<T>) {
    this.#comp = comp;
    const orb = Orb.createRelay<any>(this, AsyncComputed.#intercept);
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
  #innerUnwrap(): Promise<T> {
    const current = this.#store;
    if (current !== cacheInvalid) {
      return current;
    }

    const prevLinker = this.#sourceLinker;
    if (prevLinker !== undefined) {
      prevLinker.linkSource = emptyFn;
    }
    const orb = this.#orb;

    const linker: SourceLinker = {
      linkSource: orb.linkSource.bind(orb),
    };
    this.#sourceLinker = linker;

    const promise = this.#comp(
      read.bind(linker) as AtomReader,
      this.#addDisposers
    );
    this.#store = promise;

    return promise;
  }
  async unwrap(): Promise<T> {
    while (true) {
      const promise = this.#innerUnwrap();
      const result = await promise;
      if (promise === this.#store) {
        return result;
      }
    }
  }
  async then<TResult = Atom<Awaited<T>>, TResultFallback = never>(
    handleResolve?:
      | ((value: Atom<Awaited<T>>) => TResult | PromiseLike<TResult>)
      | null
      | undefined,
    handleReject?:
      | ((reason: unknown) => PromiseLike<TResultFallback>)
      | null
      | undefined
  ): Promise<Awaited<TResult | TResultFallback>> {
    try {
      let awaitedAtom = this.#awaitedAtom?.deref();
      if (awaitedAtom === undefined) {
        let result: Awaited<T>;
        while (true) {
          const promise = this.#innerUnwrap();
          result = await promise;
          if (promise === this.#store) {
            break;
          }
        }
        awaitedAtom = new AwaitedAtom(this, result) as AwaitedAtom<T>;
      }
      return (
        handleResolve == undefined
          ? awaitedAtom
          : await handleResolve(awaitedAtom)
      ) as Awaited<TResult>;
    } catch (err) {
      if (handleReject != undefined) {
        return handleReject(err) as Awaited<TResultFallback>;
      }
      throw err;
    }
  }
  static #addDisposersInit(this: AsyncComputed<any>, ...disposers: Disposer[]) {
    let addDisposers = this.#addDisposers;
    if (this.#dispose === emptyFn) {
      const bucket = createDisposerBucket();
      addDisposers = bucket.addDisposers;
      this.#dispose = bucket.dispose;
      this.#addDisposers = addDisposers;
    }
    addDisposers(...disposers);
  }
  static #intercept(this: RelayOrb<AsyncComputed<any>>): boolean {
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

const scheduled: Effect[] = [];

export class Effect {
  #read: AtomReader;
  #innerRun: (read: AtomReader) => void;
  #canSchedule = false;
  constructor(run: (read: AtomReader) => void) {
    const orb = Orb.createReceiver(this, Effect.#intercept);
    this.#read = read.bind(orb) as AtomReader;
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
  static #intercept(this: ReceiverOrb<Effect>): boolean {
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
