import { scheduleCleanup } from './schedulers.js';

interface SignalLink {
  isDynamic: boolean;
  consumer: WeakRef<SignalNode<any>>;
  consumerId: string;
  consumerVersion: number;
  source: WeakRef<SignalNode<any>>;
  sourceConsumerSlot: number;
  sourceId: string;
}

export interface Disposer {
  (): void;
}

interface Subscription {
  handler: () => void;
  next?: Subscription;
  prev?: Subscription;
}

interface InternalSignalNode {
  id: string;
  version: number;
  consumerLinks: SignalLink[];
  sourceLinks: Record<string, SignalLink>;
  subscriptionHead?: Subscription;
}

const scheduledLinkTrims = new Set<WeakRef<SignalNode<any>>>();

let canScheduleLinkTrim = true;

// TODO: make recursive, only if we can avoid traveling down consumers that chose not to propagate an update
// TODO: add maxConsumers: overrides maxAge and remove first stale links until count is less than maxConsumers
// TODO: maybe move maxAge and maxConsumers onto node itself and allow option passed to customize (better yet a setTrimOptions method)
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

function scheduleTrimLinks() {
  if (canScheduleLinkTrim) {
    canScheduleLinkTrim = false;
    scheduleCleanup(trimScheduledLinks);
  }
}

function defaultIntercept() {
  return true;
}

let isUpdatePropagating = false;
const updateQueue: SignalNode[] = [];

let nextIdNum = 0;
const emptyArray = Object.freeze([]) as [];
const emptySourceLinks = Object.freeze(Object.create(null)) as Record<
  string,
  SignalLink
>;

export class SignalNode<TMeta = unknown> {
  readonly id = `s${nextIdNum++}`;
  readonly version = 0;
  readonly weakRef: WeakRef<this> = new WeakRef(this);
  readonly meta: TMeta;
  private sourceLinks: Record<string, SignalLink> = emptySourceLinks;
  private consumerLinks: SignalLink[] = emptyArray;
  private subscriptionHead?: Subscription;
  private intercept: (this: this) => boolean;

  constructor(meta: TMeta, intercept?: (this: SignalNode<TMeta>) => boolean) {
    this.meta = meta;
    this.intercept = intercept ?? defaultIntercept;
  }

  private safeIntercept() {
    try {
      return this.intercept();
    } catch (err) {
      // TODO: dev mode log
    }
    return false;
  }

  private notifySubscribers() {
    let next = this.subscriptionHead;
    while (next) {
      try {
        next.handler();
      } catch (err) {
        // TODO: dev mode log
      }
      next = next.next;
    }
  }

  private propagateUpdate() {
    const consumers = this.consumerLinks;
    if (consumers.length) {
      scheduledLinkTrims.add(this.weakRef);

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
              const shouldUpdate = consumer.safeIntercept();

              if (shouldUpdate) {
                (consumer as any).version++;
                // TODO: if link trim can be recursive then remove line
                scheduledLinkTrims.add(link.consumer);

                consumer.notifySubscribers();

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

      return true;
    }

    return false;
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

  recordSource(source: SignalNode<any>, isDynamic = true) {
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
      consumer: this.weakRef,
      consumerId: this.id,
      consumerVersion: this.version,
      source: source.weakRef,
      sourceConsumerSlot: sourceConsumers.length,
      sourceId,
    };

    sourceConsumers.push(link);
    sourceLinks[sourceId] = link;
  }

  subscribe(handler: () => void): Disposer {
    const subHead = this.subscriptionHead;
    let sub: Subscription | undefined = {
      prev: undefined,
      handler,
      next: subHead,
    };
    if (subHead) {
      subHead.prev = sub;
    }
    this.subscriptionHead = sub;

    return () => {
      if (sub) {
        if (sub.prev) {
          sub.prev = sub.next;
        } else {
          this.subscriptionHead = sub.next;
        }
        sub = undefined;
      }
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

  getSourceCount(): number {
    let sourcesCount = 0;

    const { sourceLinks } = this;

    for (const link of Object.values(sourceLinks)) {
      if (!link.isDynamic || link.consumerVersion === this.version) {
        const source = link.source.deref();
        if (source) {
          sourcesCount++;
        }
      }
    }

    return sourcesCount;
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

  getConsumerCount(): number {
    let consumerCount = 0;

    const { consumerLinks } = this;

    for (const link of consumerLinks) {
      const consumer = link.consumer.deref();
      if (consumer && link.consumerVersion === consumer.version) {
        consumerCount++;
      }
    }

    return consumerCount;
  }

  getSubscriptionCount(): number {
    let subscriptionCount = 0;
    let next = this.subscriptionHead;
    while (next) {
      subscriptionCount++;
      next = next.next;
    }
    return subscriptionCount;
  }

  trim(maxAge = 0): void {
    if (maxAge < 0) {
      throw new Error('Max age must be greater or equal to 0');
    }

    trimNodeLinks(this as any, maxAge);
  }

  update() {
    const rootShouldUpdate = this.safeIntercept();

    if (!rootShouldUpdate) {
      return;
    }

    if (isUpdatePropagating) {
      updateQueue.push(this as SignalNode);
      return;
    }

    isUpdatePropagating = true;

    let node: SignalNode | undefined = this;
    let shouldScheduleTrim = false;

    while (node) {
      (node as any).version++;
      node.notifySubscribers();
      shouldScheduleTrim = node.propagateUpdate();

      node = updateQueue.pop();
    }

    isUpdatePropagating = false;

    if (shouldScheduleTrim) {
      scheduleTrimLinks();
    }
  }
}
