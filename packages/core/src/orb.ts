interface OrbLink {
  consumer: WeakRef<Orb>;
  consumerId: string;
  consumerVersion: number;
  source?: Orb;
  sourceConsumerSlot: number;
}

interface LinkArray extends Array<OrbLink> {}
interface LinkRecord extends Record<string, OrbLink> {}

let scheduledNodeSourceTrims = new Set<WeakRef<Orb>>();

// const afterTransmitQueue: (() => undefined)[] = [];

let idCounter = 0n;
const emptyArray = [] as [];
const emptySourceLinks: LinkRecord = Object.create(null);

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

export class Orb<TData = unknown> {
  #id = `o:${idCounter++}`;
  #version = 0;
  #weakRef = new WeakRef(this);
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
    return (this.#weakRef ??= new WeakRef(this));
  }
  get isTransmitter(): boolean {
    return (this.#flags & ORB_FLAG_TRANSMIT) === ORB_FLAG_TRANSMIT;
  }
  get isReceiver(): boolean {
    return (this.#flags & ORB_FLAG_RECEIVE) === ORB_FLAG_RECEIVE;
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
      const source = link.source;

      if (source !== undefined) {
        removeLinkFromConsumerLinks(link, source.#consumerLinks);
      }
    }
    this.#sourceLinks = Object.create(null);
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
    const existingLink = sourceLinks[sourceId];

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
    sourceLinks[sourceId] = link;
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
          const source = link.source;

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
          const isDynamicallyLinked = link.consumerVersion === versionBefore;
          if (isDynamicallyLinked || link.consumerVersion === Infinity) {
            propagatedNodeIds.add(link.consumerId);
            if (consumer.#safeIntercept()) {
              if (++consumer.#version >= MAX_VERSION) {
                consumer.#rollVersion();
              } else {
                scheduledNodeSourceTrims.add(consumerRef);
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
    Orb.#propagatedNodeIds = new Set<string>();
    linkStack.length = 0;
    Orb.#canStartPropagation = true;
  }

  // TODO: (Pretty sure none of this is relevant anymore)
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
    orb.#flags = ORB_FLAG_TRANSMIT;
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
    const orb = new Orb(data, intercept) as Orb<TData>;
    orb.#weakRef = new WeakRef(orb);
    orb.#consumerLinks = [];
    orb.#sourceLinks = Object.create(null);
    orb.#flags = ORB_FLAG_TRANSMIT | ORB_FLAG_RECEIVE;

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
    const orb = new Orb(data, intercept) as Orb<TData>;
    orb.#weakRef = new WeakRef(orb);
    orb.#sourceLinks = Object.create(null);
    orb.#flags = ORB_FLAG_RECEIVE;

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
    const orb = new Orb(data, intercept) as Orb<TData>;
    orb.#weakRef = new WeakRef(orb);
    orb.#consumerLinks = [];
    orb.#sourceLinks = Object.create(null);
    orb.#flags = ORB_FLAG_TRANSMIT | ORB_FLAG_RECEIVE;

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
