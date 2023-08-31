import { scheduleCleanup } from './schedulers.js';

interface SignalLink {
  isDynamic: boolean;
  consumer: WeakRef<SignalNode<any, any>>;
  consumerId: string;
  consumerVersion: number;
  source: WeakRef<SignalNode<any, any>>;
  sourceConsumerSlot: number;
  sourceId: string;
}

interface Disposer {
  (): void;
}

interface SignalSubscription<TMessage> {
  handler?: (message: TMessage) => void;
}

interface InternalSignalNode {
  id: string;
  version: number;
  consumerLinks: SignalLink[];
  sourceLinks: Record<string, SignalLink>;
  subscriptions: SignalSubscription<any>[];
}

const scheduledLinkTrims = new Set<WeakRef<SignalNode<any, any>>>();
const scheduledSubscriptionTrims = new Set<WeakRef<SignalNode<any, any>>>();

let canScheduleLinkTrim = true;
let canScheduleSubscriptionTrim = true;

function trimNodeLinks(node: InternalSignalNode, maxAge: number) {
  // In place filtering of consumer links
  const { consumerLinks, id } = node;

  let linkCount = consumerLinks.length;
  let i = 0;
  let j = linkCount - 1;

  while (i <= j) {
    const jLink = consumerLinks[j]!;
    const jConsumer = jLink.consumer.deref() as InternalSignalNode | undefined;

    if (jConsumer === undefined) {
      linkCount--;
    } else if (jLink.consumerVersion - jConsumer.version > maxAge) {
      linkCount--;
      delete jConsumer.sourceLinks[id];
    } else {
      while (i <= j) {
        const iLink = consumerLinks[i]!;
        const iConsumer = iLink.consumer.deref() as
          | InternalSignalNode
          | undefined;

        if (iConsumer === undefined) {
          linkCount--;
          break;
        } else if (iLink.consumerVersion - iConsumer.version > maxAge) {
          linkCount--;
          delete iConsumer.sourceLinks[id];
          break;
        }

        i++;
      }

      if (i < j) {
        consumerLinks[i] = jLink;
      }
    }

    j--;
  }

  consumerLinks.length = linkCount;
}

function scheduleTrimSubscriptions(): void {
  if (canScheduleSubscriptionTrim) {
    canScheduleSubscriptionTrim = false;
    scheduleCleanup(trimScheduledSubscriptions);
  }
}

function trimScheduledSubscriptions() {
  for (const ref of scheduledSubscriptionTrims) {
    const node = ref.deref() as InternalSignalNode | undefined;
    if (node) {
      node.subscriptions = node.subscriptions.filter(
        (handler) => handler !== undefined
      );
    }
  }
  canScheduleSubscriptionTrim = true;
}

function scheduleTrimLinks() {
  if (canScheduleLinkTrim) {
    canScheduleLinkTrim = false;
    scheduleCleanup(trimScheduledLinks);
  }
}

function trimScheduledLinks() {
  for (const ref of scheduledLinkTrims) {
    const node = ref.deref() as InternalSignalNode | undefined;
    if (node) {
      trimNodeLinks(node, 2);
    }
  }
  scheduledLinkTrims.clear();

  canScheduleLinkTrim = true;
}

function defaultIntercept() {
  return true;
}

let isUpdatePropagating = false;
const updateQueue: { node: SignalNode<any, any>; message: any }[] = [];

let nextIdNum = 0;
const emptyArray = Object.freeze([]) as [];
const emptySourceLinks = Object.freeze(Object.create(null)) as Record<
  string,
  SignalLink
>;

export class SignalNode<TMessage = unknown, TMeta = unknown> {
  readonly id = `s${nextIdNum++}`;
  readonly version = 0;
  private weakSelf: WeakRef<this> = new WeakRef(this);
  private sourceLinks: Record<string, SignalLink> = emptySourceLinks;
  private consumerLinks: SignalLink[] = emptyArray;
  private subscriptions: SignalSubscription<TMessage>[] = emptyArray;
  readonly meta: TMeta;
  intercept: (this: this, message: TMessage) => boolean;

  constructor(
    meta: TMeta,
    intercept?: (
      this: SignalNode<TMessage, TMeta>,
      message: TMessage
    ) => boolean
  ) {
    this.meta = meta;
    this.intercept = intercept ?? defaultIntercept;
  }

  initAsSource() {
    if (this.consumerLinks === emptyArray) {
      this.consumerLinks = [];
    }
  }
  initAsConsumer() {
    if (this.sourceLinks === emptySourceLinks) {
      this.sourceLinks = Object.create(null);
    }
  }

  recordSource(source: SignalNode<any, TMessage>, isDynamic = true) {
    const sourceId = source.id;
    const sourceLinks = this.sourceLinks;
    const existingLink = sourceLinks[sourceId];

    if (existingLink) {
      existingLink.consumerVersion = this.version;
      return;
    }

    const sourceConsumers = source.consumerLinks;

    const link: SignalLink = {
      isDynamic,
      consumer: this.weakSelf,
      consumerId: this.id,
      consumerVersion: this.version,
      source: source.weakSelf,
      sourceConsumerSlot: sourceConsumers.length,
      sourceId,
    };

    sourceConsumers.push(link);
    sourceLinks[sourceId] = link;
  }

  subscribe(handler: (message: TMessage) => void): Disposer {
    const subscription: SignalSubscription<TMessage> = { handler };

    if (this.subscriptions === emptyArray) {
      this.subscriptions = [subscription];
    } else {
      this.subscriptions.push(subscription);
    }

    return () => {
      subscription.handler = undefined;
      scheduledSubscriptionTrims.add(this.weakSelf);
      scheduleTrimSubscriptions();
    };
  }

  getSources(): SignalNode<unknown>[] {
    const sources: SignalNode<unknown>[] = [];

    const { sourceLinks } = this;

    for (const link of Object.values(sourceLinks)) {
      if (!link.isDynamic || link.consumerVersion === this.version) {
        const source = link.source.deref();
        if (source) {
          sources.push(source);
        }
      }
    }

    return sources;
  }

  getConsumers(): SignalNode<unknown>[] {
    const consumers: SignalNode<unknown>[] = [];

    const { consumerLinks } = this;

    for (const link of consumerLinks) {
      const consumer = link.consumer.deref();
      if (consumer && link.consumerVersion === consumer.version) {
        consumers.push(consumer);
      }
    }

    return consumers;
  }

  trim(maxAge = 0): void {
    if (maxAge < 0) {
      throw new Error('Max age must be greater or equal to 0');
    }

    trimNodeLinks(this as any, maxAge);
  }

  update(message: TMessage) {
    if (isUpdatePropagating) {
      updateQueue.push({ node: this, message });
      return;
    }

    const rootShouldUpdate = this.intercept(message);

    if (!rootShouldUpdate) {
      return;
    }

    isUpdatePropagating = true;

    scheduledLinkTrims.add(this.weakSelf);

    (this as any).version++;

    const rootSubs = this.subscriptions;
    for (const { handler } of rootSubs) {
      handler?.(message);
    }

    const consumers = this.consumerLinks;
    if (consumers.length) {
      const notified = new Set<string>();
      notified.add(this.id);

      let links = consumers;
      const linkStack: SignalLink[][] = [];
      let i = links.length - 1;
      while (i >= 0) {
        const link = links[i]!;

        if (!notified.has(link.consumerId)) {
          const consumer = link.consumer.deref();

          if (consumer) {
            if (!link.isDynamic || link.consumerVersion === consumer.version) {
              notified.add(link.consumerId);
              const shouldUpdate = consumer.intercept(message);

              if (shouldUpdate) {
                (consumer as any).version++;
                scheduledLinkTrims.add(link.consumer);

                const consumerSubs = consumer.subscriptions;
                for (const { handler } of consumerSubs) {
                  handler?.(message);
                }

                const consumerConsumers = consumer.consumerLinks;
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

      scheduleTrimLinks();
    }

    isUpdatePropagating = false;

    while (updateQueue.length) {
      const { node, message } = updateQueue.pop()!;
      node.update(message);
    }
  }
}
