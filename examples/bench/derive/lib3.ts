interface SignalLink {
  consumer: WeakRef<SignalNode<any>>;
  consumerId: string;
  consumerVersion: number;
  source: WeakRef<SignalNode<any>>;
  sourceConsumerSlot: number;
}

export interface Disposer {
  (): void;
}

interface LinkArray extends Array<SignalLink> {}
interface LinkRecord extends Record<string, SignalLink> {}

let canScheduleLinkTrim = true;
let scheduledNodeSourceTrims = new Set<WeakRef<SignalNode<any>>>();

const afterTransmitQueue: (() => void)[] = [];

let nextIdNum = 0n;
const emptyArray = Object.freeze([]) as [];
const emptySourceLinks: LinkRecord = Object.freeze(Object.create(null));

function removeLinkFromConsumerLinks(link: SignalLink, links: LinkArray) {
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

export class SignalNode<TData> {
  #id = `s${nextIdNum++}`;
  #version = 0;
  #weakRef: WeakRef<this> = new WeakRef(this);
  #sourceLinks: LinkRecord = emptySourceLinks;
  #consumerLinks: LinkArray = emptyArray;
  // #staticSources: WeakRef<SignalTransmitter>[] = emptyArray;
  #intercept: (this: this) => void;
  data: TData;

  get id() {
    return this.#id;
  }
  get version() {
    return this.#version;
  }
  get weakRef() {
    return this.#weakRef;
  }

  private constructor(data?: any, intercept?: (this: SignalNode<any>) => void) {
    this.data = data;
    this.#intercept = intercept ?? this.updateVersion;
  }

  #safeIntercept(): void {
    try {
      return this.#intercept();
    } catch (err) {
      // TODO: dev mode log
    }
  }

  updateVersion(): void {
    this.#version++;
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

  getSources(): SignalNode<unknown>[] {
    throw notImplemented();
  }

  getSourceCount(): number {
    throw notImplemented();
  }

  getConsumers(): SignalNode<unknown>[] {
    throw notImplemented();
  }

  getConsumerCount(): number {
    throw notImplemented();
  }

  static #trimNodeSourceLinks(this: void, node: SignalNode<any>): void {
    const version = node.#version;
    const sourceLinks = node.#sourceLinks;
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
    const trimSourceLinks = SignalNode.#trimNodeSourceLinks;
    for (const ref of scheduledNodeSourceTrims) {
      const node = ref.deref();
      if (node) {
        trimSourceLinks(node);
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
            consumer.#safeIntercept();

            const versionAfter = consumer.#version;
            if (versionAfter > versionBefore) {
              if (versionAfter >= MAX_VERSION) {
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

  static #transmit(this: SignalNode<any>) {
    const version = this.#version;

    this.#safeIntercept();

    if (version < this.#version) {
      const consumerLinks = this.#consumerLinks;

      if (consumerLinks.length) {
        SignalNode.#propagate(consumerLinks);
        SignalNode.#scheduleTrimLinks();
      }
    }

    if (afterTransmitQueue.length) {
      for (let i = 0; i < afterTransmitQueue.length; i++) {
        afterTransmitQueue[i]();
      }
      afterTransmitQueue.length = 0;
    }
  }

  static #recordSource(
    this: SignalNode<any>,
    source: SignalTransmitter<any>
  ): void {
    const sourceLinks = this.#sourceLinks;

    const sourceId = (source as SignalNode<any>).#id;

    const existingLink = sourceLinks[sourceId];

    if (existingLink !== undefined) {
      existingLink.consumerVersion = this.#version;
      return;
    }

    const sourceConsumers = (source as SignalNode<any>).#consumerLinks;

    const link: SignalLink = {
      consumer: this.#weakRef,
      consumerId: this.#id,
      consumerVersion: this.#version,
      source: (source as SignalNode<any>).#weakRef,
      sourceConsumerSlot: sourceConsumers.length,
    };

    try {
      sourceConsumers.push(link);
      sourceLinks[sourceId] = link;
    } catch {
      throw new Error('Either node cannot receive, or source cannot transmit');
    }
  }

  static #registerStaticSources(
    node: SignalNode<any>,
    staticSources: SignalNode<any>[]
  ) {
    const consumer = node.#weakRef;
    const consumerId = node.#id;
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
      throw new Error('Expected array of transmitter nodes');
    }
  }

  static createTransmitter(): {
    node: SignalTransmitter<void>;
    transmit: () => void;
  };
  static createTransmitter<TData>(
    data: TData,
    intercept?: (this: SignalNode<TData>) => void
  ): {
    node: SignalTransmitter<TData>;
    transmit: () => void;
  };
  static createTransmitter<TData>(
    data?: TData,
    intercept?: (this: SignalNode<TData>) => void
  ) {
    const node = new SignalNode<TData>(data, intercept);
    node.#consumerLinks = [];

    return { node, transmit: this.#transmit.bind(node) };
  }
  static createRelay<TData>(
    data: TData,
    intercept: (this: SignalNode<TData>) => void,
    staticSources?: SignalTransmitter<any>[]
  ): { node: SignalRelay<TData>; watch: SignalWatcher } {
    const node = new SignalNode<TData>(data, intercept);
    node.#consumerLinks = [];
    node.#sourceLinks = Object.create(null);

    if (staticSources !== undefined) {
      SignalNode.#registerStaticSources(
        node,
        staticSources as SignalNode<any>[]
      );
    }

    return { node, watch: SignalNode.#recordSource.bind(node) };
  }
  static createReceiver<TData>(
    data: TData,
    intercept: (this: SignalNode<TData>) => void,
    staticSources?: SignalTransmitter<any>[]
  ): { node: SignalReceiver<TData>; watch: SignalWatcher } {
    const node = new SignalNode<TData>(data, intercept);
    node.#sourceLinks = Object.create(null);

    if (staticSources !== undefined) {
      SignalNode.#registerStaticSources(
        node,
        staticSources as SignalNode<any>[]
      );
    }

    return { node, watch: SignalNode.#recordSource.bind(node) };
  }
  static queueAfterTransmit(callback: () => void) {
    afterTransmitQueue.push(callback);
  }
}

interface SignalWatcher {
  (source: SignalTransmitter<any>): void;
}

interface SignalNodeBase<TData> {
  readonly id: string;
  readonly version: number;
  readonly weakRef: WeakRef<this>;
  data: TData;
  updateVersion(): void;
}

export interface SignalTransmitter<TData> extends SignalNodeBase<TData> {
  getConsumers(): SignalReceiver<unknown>[];
  getConsumerCount(): number;
}

export interface SignalReceiver<TData> extends SignalNodeBase<TData> {
  // recordSource(node: SignalTransmitter<any>, isDynamic?: boolean): void;
  getSources(): SignalTransmitter<unknown>[];
  getSourceCount(): number;
}

export interface SignalRelay<TData>
  extends SignalTransmitter<TData>,
    SignalReceiver<TData> {}

// Not part of core:

export const emitterKey = Symbol('Emitter');

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
export const signalKey = Symbol('Signal');

export interface Atom<T> {
  [signalKey]: SignalTransmitter<unknown>;
  [emitterKey]: Emitter<void>;
  unwrap(): T;
  map<U>(mapper: (value: T) => U): Atom<U>;
}

const emptyTransmit = () => {};

export class StateAtom<T> implements Atom<T> {
  #node?: SignalTransmitter<void>;
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
  get [emitterKey]() {
    const existingEmitter = this.#emitter;
    if (existingEmitter !== undefined) {
      return existingEmitter;
    }

    const { emitter, emit } = Emitter.create();

    this.#emitter = emitter;
    this.#emit = emit;

    return emitter;
  }
  get [signalKey]() {
    const existingNode = this.#node;
    if (existingNode !== undefined) {
      return existingNode;
    }

    const { node, transmit } = SignalNode.createTransmitter();
    this.#node = node;
    this.#transmit = transmit;

    return node;
  }
  unwrap(): T {
    return this.#store;
  }
  map<U>(mapper: (value: T) => U): Atom<U> {
    return new MappedAtom(this, mapper);
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
  get [emitterKey]() {
    return this.#input[emitterKey];
  }
  get [signalKey]() {
    return this.#input[signalKey];
  }
  unwrap(): U {
    return this.#mapper(this.#input.unwrap());
  }
  map<V>(mapper: (value: U) => V): Atom<V> {
    return new MappedAtom(this, mapper);
  }
}

export const cacheInvalid = Symbol();

interface AtomReader {
  <T>(atom: Atom<T>): T;
}

export class Derived<TValue> implements Atom<TValue> {
  #node: SignalRelay<this>;
  #watchNode: SignalWatcher;
  #emitter?: Emitter<void>;
  #emit = emptyTransmit;
  #store: TValue | typeof cacheInvalid = cacheInvalid;
  #deriver: (watch: SignalWatcher) => TValue;
  constructor(inputs: Atom<unknown>[], deriver: () => TValue) {
    this.#deriver = deriver;
    const inputNodes = inputs.map((atom) => atom[signalKey]);
    const { node, watch } = SignalNode.createRelay<any>(
      this,
      Derived.#intercept,
      inputNodes
    );
    this.#node = node;
    this.#watchNode = watch;
  }
  get [emitterKey]() {
    const existingEmitter = this.#emitter;
    if (existingEmitter !== undefined) {
      return existingEmitter;
    }

    const { emitter, emit } = Emitter.create();

    this.#emitter = emitter;
    this.#emit = emit;

    return emitter;
  }
  get [signalKey]() {
    return this.#node;
  }
  unwrap(): TValue {
    const current = this.#store;
    if (current === cacheInvalid) {
      return (this.#store = this.#deriver(this.#watchNode));
    }
    return current;
  }
  map<U>(mapper: (value: TValue) => U): Atom<U> {
    return new MappedAtom(this, mapper);
  }
  subscribe(_handler: () => void): Disposer {
    return () => {};
  }
  static #intercept(this: SignalRelay<Derived<unknown>>) {
    const derived = this.data;
    if (derived.#store === cacheInvalid) {
      return;
    }
    derived.#store = cacheInvalid;
    derived.#emit();
    this.updateVersion();
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

function read<T>(this: SignalWatcher, atom: Atom<T>): T {
  this(atom[signalKey]);
  return atom.unwrap();
}

export class Computed<T> implements Atom<T> {
  #node: SignalRelay<this>;
  #watchNode: SignalWatcher;
  #emitter?: Emitter<void>;
  #read: AtomReader;
  #emit = emptyTransmit;
  #store: T | typeof cacheInvalid = cacheInvalid;
  #comp: (read: AtomReader, watch: SignalWatcher) => T;
  constructor(comp: (read: AtomReader) => T) {
    this.#comp = comp;
    const { node, watch } = SignalNode.createRelay<any>(
      this,
      Computed.#intercept
    );
    this.#node = node;
    this.#watchNode = watch;
    this.#read = read.bind(watch) as AtomReader;
    // this.#read = (atom) => {
    //   node.recordSource(atom[signalKey]);
    //   return atom.unwrap();
    // };
  }
  get [emitterKey]() {
    const existingEmitter = this.#emitter;
    if (existingEmitter !== undefined) {
      return existingEmitter;
    }

    const { emitter, emit } = Emitter.create();

    this.#emitter = emitter;
    this.#emit = emit;

    return emitter;
  }
  get [signalKey]() {
    return this.#node;
  }
  unwrap(): T {
    const current = this.#store;
    if (current === cacheInvalid) {
      return (this.#store = this.#comp(this.#read, this.#watchNode));
    }
    return current;
  }
  map<U>(mapper: (value: T) => U): Atom<U> {
    return new MappedAtom(this, mapper);
  }
  static #intercept(this: SignalRelay<Computed<unknown>>) {
    const computed = this.data;
    if (computed.#store === cacheInvalid) {
      return;
    }
    computed.#store = cacheInvalid;
    computed.#emit();
    this.updateVersion();
  }
}

export function computed<T>(compute: (read: AtomReader) => T): Computed<T> {
  return new Computed(compute);
}

function emptyFn() {}

function disposeBucket(this: Disposer[]) {
  for (let i = 0; i < this.length; i++) {
    this[i]();
  }
  this.length = 0;
}

// const arrayPush = Array.prototype.push;

// function createDisposerBucket() {
//   const disposers: Disposer[] = [];
//   return {
//     dispose: disposeBucket.bind(disposers),
//     addDisposers: arrayPush.bind(disposers),
//   };
// }

// interface AsyncAtom<T> extends Atom<Promise<T>> {
//   mapAsync<U>(mapper: (value: Awaited<T>) => U): AsyncAtom<U>;
//   then<TResult = Atom<Awaited<T>>, TResultFallback = never>(
//     handleResolve?:
//       | ((value: Atom<Awaited<T>>) => TResult | PromiseLike<TResult>)
//       | null
//       | undefined,
//     handleReject?:
//       | ((reason: unknown) => PromiseLike<TResultFallback>)
//       | null
//       | undefined
//   ): Promise<Awaited<TResult | TResultFallback>>;
// }

// export class AsyncComputed<T> implements AsyncAtom<T> {
//   #node: SignalRelay<this>;
//   #watchNode: SignalWatcher;
//   #emitter?: Emitter<void>;
//   #read?: AtomReader;
//   #emit = emptyTransmit;
//   #store: Promise<Awaited<T>> | typeof cacheInvalid = cacheInvalid;
//   #setResult: (value: Awaited<T>) => void = this.#createAtom;
//   #initPromise: Promise<Atom<Awaited<T>>>;
//   #initResolve?: (atom: Atom<Awaited<T>>) => void;
//   #initReject?: (reason: unknown) => void;
//   #comp: (
//     read: AtomReader,
//     addDisposers: (...disposers: Disposer[]) => void
//   ) => Promise<T>;
//   #dispose = emptyFn;
//   #addDisposers = AsyncComputed.#addDisposersInit.bind(this);
//   constructor(comp: (this: AsyncComputed<T>, read: AtomReader) => Promise<T>) {
//     this.#comp = comp;
//     const { node, watch } = SignalNode.createRelay<any>(
//       this,
//       AsyncComputed.#intercept
//     );
//     this.#node = node;
//     this.#watchNode = watch;
//     this.#initPromise = new Promise((resolve, reject) => {
//       this.#initResolve = resolve;
//       this.#initReject = reject;
//     });
//   }
//   #createAtom(value: Awaited<T>) {
//     const [atom, set] = createAtom(value);
//     this.#setResult = set;
//     this.#initResolve!(atom);
//     this.#initResolve = undefined;
//     this.#initReject = undefined;
//   }
//   get [emitterKey]() {
//     const existingEmitter = this.#emitter;
//     if (existingEmitter !== undefined) {
//       return existingEmitter;
//     }

//     const { emitter, emit } = Emitter.create();

//     this.#emitter = emitter;
//     this.#emit = emit;

//     return emitter;
//   }
//   get [signalKey]() {
//     return this.#node;
//   }
//   unwrap(): Promise<Awaited<T>> {
//     const current = this.#store;
//     if (current !== cacheInvalid) {
//       return current;
//     }

//     const read: AtomReader = (atom) => {
//       if (read === this.#read) {
//         this.#watchNode(atom[signalKey]);
//       }
//       return atom.unwrap();
//     };
//     this.#read = read;

//     const promise = (
//       this.#comp(read, this.#addDisposers) as Promise<Awaited<T>>
//     ).then(
//       (result) => {
//         if (this.#store === promise) {
//           // TODO: Should inactivate read?
//           this.#setResult(result);
//         }
//         return result;
//       },
//       (cause: unknown) => {
//         const reject = this.#initReject;
//         if (reject !== undefined) {
//           // TODO: Dev log error
//           reject(new Error('Failed to initialize', { cause }));
//         }
//         // TODO: else Dev log error w cause

//         throw cause;
//       }
//     );
//     this.#store = promise;

//     return promise;
//   }
//   async then<TResult = Atom<Awaited<T>>, TResultFallback = never>(
//     handleResolve?:
//       | ((value: Atom<Awaited<T>>) => TResult | PromiseLike<TResult>)
//       | null
//       | undefined,
//     handleReject?:
//       | ((reason: unknown) => PromiseLike<TResultFallback>)
//       | null
//       | undefined
//   ): Promise<Awaited<TResult | TResultFallback>> {
//     try {
//       const syncAtom = await this.#initPromise;
//       return (
//         handleResolve == undefined ? syncAtom : await handleResolve(syncAtom)
//       ) as Awaited<TResult>;
//     } catch (err) {
//       if (handleReject != undefined) {
//         return handleReject(err) as Awaited<TResultFallback>;
//       }
//       throw err;
//     }
//   }
//   map<U>(mapper: (value: Promise<Awaited<T>>) => U): Atom<U> {
//     return new MappedAtom(this, mapper);
//   }
//   mapAsync<U>(mapper: (value: Awaited<T>) => U): AsyncAtom<U> {}
//   static #addDisposersInit(this: AsyncComputed<any>, ...disposers: Disposer[]) {
//     let addDisposers = this.#addDisposers;
//     if (this.#dispose === emptyFn) {
//       const bucket = createDisposerBucket();
//       addDisposers = bucket.addDisposers;
//       this.#dispose = bucket.dispose;
//       this.#addDisposers = addDisposers;
//     }
//     addDisposers(...disposers);
//   }
//   static #intercept(this: SignalRelay<AsyncComputed<any>>) {
//     const computed = this.data;
//     if (computed.#store === cacheInvalid) {
//       return;
//     }
//     computed.#dispose();
//     computed.#store = cacheInvalid;
//     computed.#emit();
//     this.updateVersion();
//   }
// }

// class AsyncMappedAtom<T, U> implements AsyncAtom<U> {
//   #input: AsyncAtom<T>;
//   #syncAtom?: Atom<Awaited<U>>;
//   #mapper: (inputValue: Awaited<T>) => U;
//   constructor(input: AsyncAtom<T>, mapper: (inputValue: T) => U) {
//     this.#input = input;
//     this.#mapper = mapper;
//   }
//   get [emitterKey]() {
//     return this.#input[emitterKey];
//   }
//   get [signalKey]() {
//     return this.#input[signalKey];
//   }
//   async unwrap(): Promise<U> {
//     return this.#mapper(await this.#input.unwrap());
//   }
//   async #createSyncAtom(): Promise<Atom<Awaited<U>>> {}
//   async then<TResult = Atom<Awaited<U>>, TResultFallback = never>(
//     handleResolve?:
//       | ((value: Atom<Awaited<U>>) => TResult | PromiseLike<TResult>)
//       | null
//       | undefined,
//     handleReject?:
//       | ((reason: unknown) => PromiseLike<TResultFallback>)
//       | null
//       | undefined
//   ): Promise<Awaited<TResult> | Awaited<TResultFallback>> {
//     try {
//       const syncAtom: Atom<Awaited<U>> = (this.#syncAtom ??=
//         await this.#createSyncAtom());
//       return (
//         handleResolve == undefined ? syncAtom : await handleResolve(syncAtom)
//       ) as Awaited<TResult>;
//     } catch (err) {
//       if (handleReject != undefined) {
//         return handleReject(err) as Awaited<TResultFallback>;
//       }
//       throw err;
//     }

//     return this.#input.then((value) => this.#mapper(value));
//   }
//   map<V>(mapper: (value: Promise<Awaited<U>>) => V): Atom<V> {
//     return new MappedAtom(this, mapper);
//   }
//   mapAsync<V>(mapper: (value: Awaited<U>) => V): AsyncAtom<V> {
//     return new AsyncMappedAtom(this as AsyncAtom<Awaited<U>>, mapper);
//   }
// }

// const a = new AsyncComputed<"foo" | "bar">(async function () {
//   // const { abort, signal: abortSignal } = new AbortController();
//   // this.addDisposer(abort);

//   let timeout: NodeJS.Timeout;

//   await new Promise((resolve) => {
//     timeout = setTimeout(resolve, 1000);
//   });

//   this.addDisposer(() => {
//     clearTimeout(timeout);
//   });

//   return "foo";
// });

// const b = await a;
// b.unwrap();

// b.map((v) => `hello ${v}` as const);

const scheduled: Effect[] = [];

export class Effect {
  #read: AtomReader;
  #innerRun: (read: AtomReader) => void;
  #canSchedule = false;
  constructor(run: (read: AtomReader) => void) {
    const { watch } = SignalNode.createReceiver(this, Effect.#intercept);
    this.#read = read.bind(watch) as AtomReader;
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
  static #intercept(this: SignalReceiver<Effect>) {
    const effect = this.data;
    if (effect.#canSchedule) {
      effect.#canSchedule = false;
      this.updateVersion();
      scheduled.push(effect);
    }
  }
}

export const runScheduledEffects = Effect.runScheduled;
