interface SignalLink {
  consumer: WeakRef<SignalNode>;
  consumerId: string;
  consumerVersion: number;
  source: WeakRef<SignalNode>;
  sourceConsumerSlot: number;
}

export interface Disposer {
  (): void;
}

interface LinkArray extends Array<SignalLink> {}
interface LinkRecord extends Record<string, SignalLink> {}

let canScheduleLinkTrim = true;
let scheduledNodeSourceTrims = new Set<WeakRef<SignalNode>>();

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

export class SignalNode {
  #id = `s${nextIdNum++}`;
  #version = 0;
  #weakRef: WeakRef<this> = new WeakRef(this);
  #sourceLinks: LinkRecord = emptySourceLinks;
  #consumerLinks: LinkArray = emptyArray;
  // #staticSources: WeakRef<SignalTransmitter>[] = emptyArray;
  #intercept: (this: this, data: unknown) => void;
  #interceptData: unknown;

  get id() {
    return this.#id;
  }
  get version() {
    return this.#version;
  }
  get weakRef() {
    return this.#weakRef;
  }

  private constructor(
    interceptData?: unknown,
    intercept?: (this: SignalNode, data: any) => void
  ) {
    this.#interceptData = interceptData;
    this.#intercept = intercept ?? this.updateVersion;
  }

  #safeIntercept(): void {
    try {
      return this.#intercept(this.#interceptData);
    } catch (err) {
      // TODO: dev mode log
    }
  }

  updateVersion(): void {
    this.#version++;
  }

  recordSource(source: SignalTransmitter): void {
    const sourceLinks = this.#sourceLinks;

    const sourceId = (source as SignalNode).#id;

    const existingLink = sourceLinks[sourceId];

    if (existingLink !== undefined) {
      if (existingLink.consumerVersion !== Infinity) {
        existingLink.consumerVersion = this.#version;
      }
      return;
    }

    const sourceConsumers = (source as SignalNode).#consumerLinks;

    const link: SignalLink = {
      consumer: this.#weakRef,
      consumerId: this.#id,
      consumerVersion: this.#version,
      source: (source as SignalNode).#weakRef,
      sourceConsumerSlot: sourceConsumers.length,
    };

    try {
      sourceConsumers.push(link);
      sourceLinks[sourceId] = link;
    } catch {
      throw new Error('Either node cannot receive, or source cannot transmit');
    }
  }

  getSources(): SignalNode[] {
    throw null;
  }

  getSourceCount(): number {
    throw null;
  }

  getConsumers(): SignalNode[] {
    throw null;
  }

  getConsumerCount(): number {
    throw null;
  }

  static #trimNodeSourceLinks(this: void, node: SignalNode): void {
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

  // static #defaultIntercept(this: SignalNode): void {
  //   this.#version++;
  // }

  static #propagate(consumers: LinkArray): void {
    const propagatedNodeIds = new Set<string>();
    let links = consumers;
    const linkStack: LinkArray[] = [];
    let i = links.length - 1;
    while (i >= 0) {
      const link = links[i]!;

      if (!propagatedNodeIds.has(link.consumerId)) {
        const consumer = link.consumer.deref();

        if (consumer !== undefined) {
          const version = consumer.#version;
          if (link.consumerVersion >= version) {
            propagatedNodeIds.add(link.consumerId);
            consumer.#safeIntercept();

            if (version < consumer.#version) {
              scheduledNodeSourceTrims.add(link.consumer);

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

  static #transmit(this: SignalNode) {
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

  static #registerStaticSources(node: SignalNode, staticSources: SignalNode[]) {
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
    node: SignalTransmitter;
    transmit: () => void;
  };
  static createTransmitter<TData>(
    data: TData,
    intercept?: (this: SignalNode, data: TData) => void
  ): {
    node: SignalTransmitter;
    transmit: () => void;
  };
  static createTransmitter<TData>(
    data?: TData,
    intercept?: (this: SignalNode, data: TData) => void
  ) {
    const node = new SignalNode(data, intercept);
    node.#consumerLinks = [];

    return { node, transmit: this.#transmit.bind(node) };
  }
  static createRelay<TData>(
    meta: TData,
    intercept: (this: SignalNode, data: TData) => void,
    staticSources?: SignalTransmitter[]
  ): SignalRelay {
    const node = new SignalNode(meta, intercept);
    node.#consumerLinks = [];
    node.#sourceLinks = Object.create(null);

    if (staticSources !== undefined) {
      SignalNode.#registerStaticSources(node, staticSources as SignalNode[]);
    }

    return node;
  }
  static createReceiver<TData>(
    meta: TData,
    intercept: (this: SignalNode, data: TData) => void,
    staticSources?: SignalTransmitter[]
  ): SignalReceiver {
    const node = new SignalNode(meta, intercept);
    node.#sourceLinks = Object.create(null);

    if (staticSources !== undefined) {
      SignalNode.#registerStaticSources(node, staticSources as SignalNode[]);
    }

    return node;
  }
  static queueAfterTransmit(callback: () => void) {
    afterTransmitQueue.push(callback);
  }
}

interface SignalNodeBase {
  readonly id: string;
  readonly version: number;
  readonly weakRef: WeakRef<this>;
  updateVersion(): void;
}

export interface SignalTransmitter extends SignalNodeBase {
  getConsumers(): SignalReceiver[];
  getConsumerCount(): number;
}

export interface SignalReceiver extends SignalNodeBase {
  recordSource(node: SignalTransmitter, isDynamic?: boolean): void;
  getSources(): SignalTransmitter[];
  getSourceCount(): number;
}

export interface SignalRelay extends SignalTransmitter, SignalReceiver {}

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

let ctxConnect: undefined | SignalReceiver;

const emptyTransmit = () => {};

export interface AtomLike<T> {
  [signalKey]: SignalTransmitter;
  [emitterKey]: Emitter<void>;
  unwrap(): T;
  read(): T;
}

export class Atom<T> implements AtomLike<T> {
  #node?: SignalTransmitter;
  #transmit: () => void = emptyTransmit;
  #emitter?: Emitter<void>;
  #emit = emptyTransmit;
  #store: T;
  private constructor(initialValue: T) {
    this.#store = initialValue;
  }
  #set(value: T) {
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
    return this.#getNode();
  }
  #getNode() {
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
  read(): T {
    ctxConnect?.recordSource(this.#getNode());
    return this.#store;
  }
  static create<T>(initialValue: T) {
    const ref = new Atom(initialValue);
    return [ref, ref.#set.bind(ref)] as const;
  }
}

export const createAtom = Atom.create;

export const cacheInvalid = Symbol();

export class Derived<T> implements AtomLike<T> {
  #node: SignalRelay;
  #emitter?: Emitter<void>;
  #emit = emptyTransmit;
  #store: T | typeof cacheInvalid = cacheInvalid;
  #deriver: () => T;
  constructor(inputs: AtomLike<unknown>[], deriver: () => T) {
    this.#deriver = deriver;
    const inputNodes = inputs.map((atom) => atom[signalKey]);
    const node = SignalNode.createRelay(this, Derived.#intercept, inputNodes);
    this.#node = node;
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
      const prevCtx = ctxConnect;
      ctxConnect = this.#node;
      const value = (this.#store = this.#deriver());
      ctxConnect = prevCtx;
      return value;
    }
    return current;
  }
  read(): T {
    ctxConnect?.recordSource(this.#node);
    return this.unwrap();
    // const current = this.#store;
    // if (current === cacheInvalid) {
    //   const prevCtx = ctxConnect;
    //   ctxConnect = this.#node;
    //   const value = (this.#store = this.#deriver());
    //   ctxConnect = prevCtx;
    //   return value;
    // }
    // return current;
  }
  static #intercept(this: SignalRelay, derived: Derived<unknown>) {
    if (derived.#store === cacheInvalid) {
      return;
    }
    derived.#store = cacheInvalid;
    derived.#emit();
    this.updateVersion();
  }
}

export function derived<T>(
  inputs: AtomLike<unknown>[],
  deriver: () => T
): AtomLike<T> {
  return new Derived(inputs, deriver);
}

export class Computed<T> implements AtomLike<T> {
  #node: SignalRelay;
  #emitter?: Emitter<void>;
  #emit = emptyTransmit;
  #store: T | typeof cacheInvalid = cacheInvalid;
  #comp: () => T;
  constructor(comp: () => T) {
    this.#comp = comp;
    const node = SignalNode.createRelay(this, Computed.#intercept);
    this.#node = node;
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
      const prevCtx = ctxConnect;
      ctxConnect = this.#node;
      const value = (this.#store = this.#comp());
      ctxConnect = prevCtx;
      return value;
    }
    return current;
  }
  read(): T {
    ctxConnect?.recordSource(this.#node);
    return this.unwrap();
  }
  static #intercept(this: SignalRelay, computed: Computed<unknown>) {
    if (computed.#store === cacheInvalid) {
      return;
    }
    computed.#store = cacheInvalid;
    computed.#emit();
    this.updateVersion();
  }
}

export function computed<T>(compute: () => T): Computed<T> {
  return new Computed(compute);
}
