import { type Disposer } from './shared.js';

interface OrbLink {
  consumer: WeakRef<Orb>;
  consumerId: string;
  consumerVersion: number;
  source?: Orb;
  sourceConsumerSlot: number;
}

interface LinkArray extends Array<OrbLink> {}
interface LinkRecord extends Map<string, OrbLink> {}

let idCounter = 0;
const emptyArray = [] as [];
const emptySourceLinks: LinkRecord = new Map();

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
const MAX_ID = Number.MAX_SAFE_INTEGER;

const ORB_FLAG_TRANSMIT = 0b00001 as const;
const ORB_FLAG_RECEIVE = 0b00010 as const;
const ORB_FLAG_CAN_TRIM = 0b00100 as const;
const ORB_FLAG_CAN_EMIT = 0b01000 as const;
const ORB_FLAG_SKIP_EMIT = 0b10000 as const;

const ORB_INIT_FLAGS_TRANSMITTER =
  ORB_FLAG_TRANSMIT | ORB_FLAG_CAN_EMIT | ORB_FLAG_CAN_TRIM;
const ORB_INIT_FLAGS_RECEIVER =
  ORB_FLAG_RECEIVE | ORB_FLAG_CAN_EMIT | ORB_FLAG_CAN_TRIM;
const ORB_INIT_FLAGS_RELAY =
  ORB_FLAG_RECEIVE | ORB_FLAG_TRANSMIT | ORB_FLAG_CAN_EMIT | ORB_FLAG_CAN_TRIM;

function defaultIntercept() {
  return true;
}

function disposedSub(): undefined {}

interface Subscription {
  handler: () => undefined;
  next?: Subscription;
  prev?: Subscription;
}

export class Orb<TData = unknown> {
  #id: string;
  #version = 0;
  #weakRef = new WeakRef(this);
  #sourceLinks: LinkRecord = emptySourceLinks;
  #consumerLinks: LinkArray = emptyArray;
  #subscriptionHead?: Subscription;
  /**
   * TTData generic needed to allow instance to be assignable to wider typed Orb
   * @see https://github.com/microsoft/TypeScript/issues/57209
   */
  #intercept: <TTData extends TData>(this: Orb<TTData>) => boolean;
  #flags = 0b0;
  data: TData;

  get id(): string {
    return this.#id;
  }
  get weakRef(): WeakRef<Orb<TData>> {
    return this.#weakRef;
  }
  get isTransmitter(): boolean {
    return !(this.#flags & ORB_FLAG_TRANSMIT);
  }
  get isReceiver(): boolean {
    return !(this.#flags & ORB_FLAG_RECEIVE);
  }

  private constructor(data: TData, intercept?: () => boolean) {
    if (idCounter === MAX_ID) {
      throw new Error('Incremental id range exceeded');
    }
    this.#id = `${idCounter++}`;
    this.data = data;
    this.#intercept = intercept ?? defaultIntercept;
  }

  subscribe(handler: () => undefined): Disposer {
    const subHead = this.#subscriptionHead;
    const sub: Subscription = {
      handler,
      next: subHead,
      prev: undefined,
    };
    if (subHead !== undefined) {
      subHead.prev = sub;
    }
    this.#subscriptionHead = sub;

    return Orb.#subDispose.bind(this, sub);
  }

  static #scheduled: Orb[] = [];
  static #emit(orb: Orb) {
    if (orb.#flags & ORB_FLAG_CAN_EMIT && orb.#subscriptionHead !== undefined) {
      orb.#flags ^= ORB_FLAG_CAN_EMIT;
      this.#scheduled.push(orb);
    }
  }
  static #subDispose(this: Orb, sub: Subscription): undefined {
    if (sub.handler === disposedSub) {
      return;
    }
    sub.handler = disposedSub;
    const { prev } = sub;
    if (prev === undefined) {
      this.#subscriptionHead = sub.next;
      if (
        this.#subscriptionHead === undefined &&
        (this.#flags & ORB_FLAG_CAN_EMIT) === 0
      ) {
        // If emit is scheduled then flag to skip it.
        this.#flags |= ORB_FLAG_SKIP_EMIT;
      }
    } else {
      prev.next = sub.next;
    }
  }
  static runEmits = (): undefined => {
    const scheduled = this.#scheduled;
    for (let i = 0; i < scheduled.length; i++) {
      const emitter = scheduled[i]!;
      if (emitter.#flags & ORB_FLAG_SKIP_EMIT) {
        emitter.#flags ^= ORB_FLAG_SKIP_EMIT | ORB_FLAG_CAN_EMIT;
        continue;
      }
      let next = emitter.#subscriptionHead;
      while (next) {
        try {
          next.handler();
        } catch (err) {
          // TODO report uncaught async err through global event system
          // console.error(err);
        }
        next = next.next;
      }
      emitter.#flags ^= ORB_FLAG_CAN_EMIT;
    }
    scheduled.length = 0;
  };

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
    for (const link of sourceLinks.values()) {
      const source = link.source;

      if (source !== undefined) {
        removeLinkFromConsumerLinks(link, source.#consumerLinks);
      }
    }
    this.#sourceLinks.clear();
  }

  static link(consumer: Orb<unknown>, source: Orb<unknown>): undefined {
    if (
      (source.#flags & ORB_FLAG_TRANSMIT) === 0 ||
      (consumer.#flags & ORB_FLAG_RECEIVE) === 0
    ) {
      // Skip for orbs that cannot form a proper flow.
      return;
    }

    const sourceLinks = consumer.#sourceLinks;
    const sourceId = source.#id;
    const existingLink = sourceLinks.get(sourceId);

    if (existingLink !== undefined) {
      existingLink.source = source;
      existingLink.consumerVersion = consumer.#version;
      return;
    }

    const sourceConsumers = source.#consumerLinks;

    const link: OrbLink = {
      consumer: consumer.#weakRef!,
      consumerId: consumer.#id,
      consumerVersion: consumer.#version,
      source,
      sourceConsumerSlot: sourceConsumers.length,
    };

    sourceConsumers.push(link);
    sourceLinks.set(sourceId, link);
  }
  static #scheduledNodeSourceTrims: WeakRef<Orb>[] = [];
  static runTrim = (): undefined => {
    const trims = Orb.#scheduledNodeSourceTrims;
    for (let i = 0; i < trims.length; i++) {
      const orb = trims[i]!.deref();
      if (orb) {
        orb.#flags ^= ORB_FLAG_CAN_TRIM;
        const version = orb.#version;
        const sourceLinks = orb.#sourceLinks;
        for (const [sourceId, link] of sourceLinks) {
          const source = link.source;

          if (source === undefined) {
            sourceLinks.delete(sourceId);
          } else if (link.consumerVersion < version) {
            sourceLinks.delete(sourceId);
            removeLinkFromConsumerLinks(link, source.#consumerLinks);
          }
        }
      }
    }
    trims.length = 0;
  };

  // bench perf of making these constants outside of the class instead
  static #canStartPropagation = true;
  // static #canRunTransmitQueue = true;
  static #propagatedNodeIds = new Set<string>();
  static #propagationLinkStack: LinkArray[] = [];

  static #propagate(consumers: LinkArray): undefined {
    this.#canStartPropagation = false;
    const propagatedNodeIds = this.#propagatedNodeIds;
    let links = consumers;
    const linkStack: LinkArray[] = this.#propagationLinkStack;
    let i = links.length - 1;
    while (i >= 0) {
      const link = links[i]!;

      if (!propagatedNodeIds.has(link.consumerId)) {
        const consumerRef = link.consumer;
        const consumer = consumerRef.deref();

        if (consumer !== undefined) {
          const versionBefore = consumer.#version;
          const isDynamicallyLinked = link.consumerVersion === versionBefore;
          if (isDynamicallyLinked || link.consumerVersion === Infinity) {
            propagatedNodeIds.add(link.consumerId);
            if (consumer.#safeIntercept()) {
              this.#emit(consumer);
              if (++consumer.#version >= MAX_VERSION) {
                consumer.#rollVersion();
              } else if (consumer.#flags & ORB_FLAG_CAN_TRIM) {
                consumer.#flags ^= ORB_FLAG_CAN_TRIM;
                this.#scheduledNodeSourceTrims.push(consumerRef);
              }
              if (isDynamicallyLinked) {
                link.source = undefined;
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
    this.#propagatedNodeIds = new Set();
    linkStack.length = 0;
    this.#canStartPropagation = true;
  }

  static #transmit(this: Orb<unknown>): undefined {
    Orb.#propagatedNodeIds.add(this.#id);
    if (++this.#version >= MAX_VERSION) {
      this.#rollVersion();
    }
    Orb.#emit(this);

    const consumerLinks = this.#consumerLinks;
    if (consumerLinks.length) {
      if (Orb.#canStartPropagation) {
        Orb.#propagate(consumerLinks);
      } else {
        Orb.#propagationLinkStack.push(consumerLinks);
      }
    }
  }

  static #registerStaticSources(orb: Orb, staticSources: Orb[]): undefined {
    const consumer = orb.#weakRef;
    const consumerId = orb.#id;
    const consumerVersion = Infinity;

    for (const source of staticSources) {
      if ((source.#flags & ORB_FLAG_TRANSMIT) === 0) {
        continue;
      }
      const links = source.#consumerLinks;
      links.push({
        consumer,
        consumerId,
        consumerVersion,
        source,
        sourceConsumerSlot: links.length,
      });
    }
  }
  static #dispose(orbRef: WeakRef<Orb<unknown>>): undefined {
    const orb = orbRef.deref();
    if (orb === undefined) {
      return;
    }
    const links = orb.#consumerLinks;
    for (let i = 0; i < links.length; i++) {
      links[i]!.source = undefined;
    }
    orb.#flags = 0;
    orb.#consumerLinks = emptyArray;
    orb.#sourceLinks = emptySourceLinks;
  }
  static #disposeRegistry = new FinalizationRegistry(Orb.#dispose);

  static createTransmitter(): TransmitterPackage<undefined>;
  static createTransmitter<TData>(
    data: TData,
    intercept?: (this: Orb<TData>) => boolean
  ): TransmitterPackage<TData>;
  static createTransmitter<TData>(
    data?: TData,
    intercept?: (this: Orb<TData>) => boolean
  ): TransmitterPackage<TData> {
    const orb = new Orb(data as TData, intercept);
    orb.#consumerLinks = [];
    orb.#flags = ORB_INIT_FLAGS_TRANSMITTER;
    const transmit = Orb.#transmit.bind(orb);

    // A transmitters only means of propagation is through transmit
    // If ability to transmit is lost then it can safely be disposed
    Orb.#disposeRegistry.register(transmit, orb.#weakRef);

    return {
      orb: orb as Orb<TData>,
      transmit,
    };
  }
  static createRelay<TData>(
    data: TData,
    intercept: (this: Orb<TData>) => boolean,
    staticSources?: Orb[]
  ): Orb<TData> {
    const orb = new Orb(data, intercept);
    orb.#consumerLinks = [];
    orb.#sourceLinks = new Map();
    orb.#flags = ORB_INIT_FLAGS_RELAY;

    if (staticSources !== undefined) {
      Orb.#registerStaticSources(orb, staticSources);
    }

    return orb;
  }
  static createReceiver<TData>(
    data: TData,
    intercept: (this: Orb<TData>) => boolean,
    staticSources?: Orb[]
  ): Orb<TData> {
    const orb = new Orb(data, intercept);
    orb.#sourceLinks = new Map();
    orb.#flags = ORB_INIT_FLAGS_RECEIVER;

    if (staticSources !== undefined) {
      Orb.#registerStaticSources(orb, staticSources);
    }

    return orb;
  }
  static createTransceiver<TData>(
    data: TData,
    intercept: (this: Orb<TData>) => boolean,
    staticSources?: Orb[]
  ): TransmitterPackage<TData> {
    const orb = new Orb(data, intercept);
    orb.#consumerLinks = [];
    orb.#sourceLinks = new Map();
    orb.#flags = ORB_INIT_FLAGS_RELAY;

    if (staticSources !== undefined) {
      Orb.#registerStaticSources(orb, staticSources);
    }

    return {
      orb: orb,
      transmit: Orb.#transmit.bind(orb),
    };
  }
}

type TransmitterPackage<TData = unknown> = {
  orb: Orb<TData>;
  transmit: () => undefined;
};

export const linkOrbs = Orb.link;

export const createTransmitterOrb = Orb.createTransmitter;

export const createReceiverOrb = Orb.createReceiver;

export const createRelayOrb = Orb.createRelay;

export const createTransceiverOrb = Orb.createTransceiver;

export const runOrbTrim = Orb.runTrim;

// export const queueAfterOrbTransmit =
//   afterTransmitQueue.push.bind(afterTransmitQueue);
