import { scheduleCleanup } from './schedulers.js';

interface OrbLink {
  consumer: WeakRef<Orb<any>>;
  consumerId: string;
  consumerVersion: number;
  source: WeakRef<Orb<any>>;
  sourceConsumerSlot: number;
}

interface LinkArray extends Array<OrbLink> {}
interface LinkRecord extends Record<string, OrbLink> {}

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
  #intercept: (this: Orb<any>) => boolean;
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
      const link = sourceLinks[sourceId]!;
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

  static #trimNodeSourceLinks(this: void, orb: Orb<any>): void {
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
      scheduleCleanup(this.#trimScheduledLinks);
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
          afterTransmitQueue[i]!();
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

export interface RelayOrb<TData = unknown> extends TransceiverOrb<TData> {}

export const ORB = Symbol('Orb');

export const linkOrbs = Orb.link;
