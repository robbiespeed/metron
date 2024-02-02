interface OrbLink {
  consumer: WeakRef<ReceiverOrb>;
  consumerId: string;
  consumerVersion: number;
  source: WeakRef<TransmitterOrb>;
  sourceConsumerSlot: number;
}

interface LinkArray extends Array<OrbLink> {}
interface LinkRecord extends Record<string, OrbLink> {}

let scheduledNodeSourceTrims = new Set<WeakRef<ReceiverOrb>>();

// const afterTransmitQueue: (() => undefined)[] = [];

let idCounter = 0n;
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
  #id = `o:${idCounter++}`;
  #version = 0;
  #weakRef: WeakRef<this> = new WeakRef(this);
  #sourceLinks: LinkRecord = emptySourceLinks;
  #consumerLinks: LinkArray = emptyArray;
  /**
   * TTData generic needed to allow instance to be assignable to wider typed Orb
   * @see https://github.com/microsoft/TypeScript/issues/57209
   */
  #intercept: <TTData extends TData>(this: Orb<TTData>) => boolean;
  // #intercept: (this: Orb<unknown>) => boolean;
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

  private constructor(data: TData, intercept?: () => boolean) {
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
      const link = sourceLinks[sourceId]!;
      const source = link.source.deref();

      if (source !== undefined) {
        removeLinkFromConsumerLinks(link, source.#consumerLinks);
      }
    }
    this.#sourceLinks = Object.create(null);
  }

  static link(
    consumer: ReceiverOrb<unknown>,
    source: TransmitterOrb<unknown>
  ): undefined {
    const sourceLinks = consumer.#sourceLinks;

    const sourceId = source.#id;

    const existingLink = sourceLinks[sourceId];

    if (existingLink !== undefined) {
      existingLink.consumerVersion = consumer.#version;
      return;
    }

    const sourceConsumers = source.#consumerLinks;

    const link: OrbLink = {
      consumer: consumer.#weakRef,
      consumerId: consumer.#id,
      consumerVersion: consumer.#version,
      source: source.#weakRef,
      sourceConsumerSlot: sourceConsumers.length,
    };

    try {
      sourceConsumers.push(link);
      sourceLinks[sourceId] = link;
    } catch {
      throw new Error('Either orb cannot receive, or source cannot transmit');
    }
  }
  // TODO bench scheduledNodeSourceTrims as an array + added orb.#canScheduleTrim
  static runTrim = (): undefined => {
    for (const ref of scheduledNodeSourceTrims) {
      const orb = ref.deref();
      if (orb) {
        const version = orb.#version;
        const sourceLinks = orb.#sourceLinks;
        for (const sourceId in sourceLinks) {
          const link = sourceLinks[sourceId]!;
          const source = link.source.deref();

          if (source === undefined) {
            delete sourceLinks[sourceId];
          } else if (link.consumerVersion < version) {
            delete sourceLinks[sourceId];
            removeLinkFromConsumerLinks(link, source.#consumerLinks);
          }
        }
      }
    }
    scheduledNodeSourceTrims = new Set();
  };

  // bench perf of making these constants outside of the class instead
  static #canStartPropagation = true;
  // static #canRunTransmitQueue = true;
  static #propagatedNodeIds = new Set<string>();
  static #propagationLinkStack: LinkArray[] = [];

  static #propagate(consumers: LinkArray): undefined {
    Orb.#canStartPropagation = false;
    const propagatedNodeIds = Orb.#propagatedNodeIds;
    let links = consumers;
    const linkStack: LinkArray[] = Orb.#propagationLinkStack;
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
    Orb.#propagatedNodeIds = new Set<string>();
    linkStack.length = 0;
    Orb.#canStartPropagation = true;
  }

  // collection/shared.ts OrbKeyMap might require that transmit be refactored to share a global propagation state
  // should bench this to make sure it's not a major pref regression for happy paths

  // alternatively could revert back and make the transmit for OrbKeyMap be added to the afterTransmitQueue?
  static #transmit(this: Orb<unknown>): undefined {
    Orb.#propagatedNodeIds.add(this.#id);
    if (++this.#version >= MAX_VERSION) {
      this.#rollVersion();
    }

    const consumerLinks = this.#consumerLinks;
    if (consumerLinks.length) {
      if (Orb.#canStartPropagation) {
        Orb.#propagate(consumerLinks);
      } else {
        Orb.#propagationLinkStack.push(consumerLinks);
      }
    }

    // if (afterTransmitQueue.length && Orb.#canRunTransmitQueue) {
    //   Orb.#canRunTransmitQueue = false;
    //   for (let i = 0; i < afterTransmitQueue.length; i++) {
    //     try {
    //       afterTransmitQueue[i]!();
    //     } catch (err) {
    //       // TODO: emit uncaught err to global
    //     }
    //   }
    //   afterTransmitQueue.length = 0;
    //   Orb.#canRunTransmitQueue = true;
    // }
  }

  static #registerStaticSources(
    orb: ReceiverOrb,
    staticSources: TransmitterOrb[]
  ): undefined {
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
    orb: TransmitterOrb<undefined>;
    transmit: () => undefined;
  };
  static createTransmitter<TData>(
    data: TData,
    intercept?: (this: Orb<TData>) => boolean
  ): {
    orb: TransmitterOrb<TData>;
    transmit: () => undefined;
  };
  static createTransmitter<TData>(
    data?: TData,
    intercept?: (this: Orb<TData>) => boolean
  ): {
    orb: TransmitterOrb<TData>;
    transmit: () => undefined;
  } {
    const orb = new Orb(data as TData, intercept);
    orb.#consumerLinks = [];
    orb.#flags |= ORB_FLAG_TRANSMIT;

    return {
      orb: orb as TransmitterOrb<TData>,
      transmit: Orb.#transmit.bind(orb),
    };
  }
  static createRelay<TData>(
    data: TData,
    intercept: (this: RelayOrb<TData>) => boolean,
    staticSources?: TransmitterOrb[]
  ): RelayOrb<TData> {
    const orb = new Orb(data, intercept) as RelayOrb<TData>;
    orb.#consumerLinks = [];
    orb.#sourceLinks = Object.create(null);
    orb.#flags |= ORB_FLAG_TRANSMIT | ORB_FLAG_RECEIVE;

    if (staticSources !== undefined) {
      Orb.#registerStaticSources(orb, staticSources);
    }

    return orb;
  }
  static createReceiver<TData>(
    data: TData,
    intercept: (this: ReceiverOrb<TData>) => boolean,
    staticSources?: TransmitterOrb[]
  ): ReceiverOrb<TData> {
    const orb = new Orb(data, intercept) as ReceiverOrb<TData>;
    orb.#sourceLinks = Object.create(null);
    orb.#flags |= ORB_FLAG_RECEIVE;

    if (staticSources !== undefined) {
      Orb.#registerStaticSources(orb, staticSources);
    }

    return orb;
  }
  static createTransceiver<TData>(
    data: TData,
    intercept: (this: TransceiverOrb<TData>) => boolean,
    staticSources?: TransmitterOrb[]
  ): {
    orb: TransceiverOrb<TData>;
    transmit: () => undefined;
  } {
    const orb = new Orb(data, intercept) as TransceiverOrb<TData>;
    orb.#consumerLinks = [];
    orb.#sourceLinks = Object.create(null);
    orb.#flags |= ORB_FLAG_TRANSMIT | ORB_FLAG_RECEIVE;

    if (staticSources !== undefined) {
      Orb.#registerStaticSources(orb, staticSources);
    }

    return {
      orb: orb,
      transmit: Orb.#transmit.bind(orb),
    };
  }
}

export interface TransmitterOrb<TData = unknown> extends Orb<TData> {
  readonly isTransmitter: true;
}

export interface ReceiverOrb<TData = unknown> extends Orb<TData> {
  readonly isReceiver: true;
}

export interface TransceiverOrb<TData = unknown> extends Orb<TData> {
  readonly isTransmitter: true;
  readonly isReceiver: true;
}

export type RelayOrb<TData = unknown> = TransceiverOrb<TData>;

export const linkOrbs = Orb.link;

export const createTransmitterOrb = Orb.createTransmitter;

export const createReceiverOrb = Orb.createReceiver;

export const createRelayOrb = Orb.createRelay;

export const createTransceiverOrb = Orb.createTransceiver;

export const runOrbTrim = Orb.runTrim;

// export const queueAfterOrbTransmit =
//   afterTransmitQueue.push.bind(afterTransmitQueue);
