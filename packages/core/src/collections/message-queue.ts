import { scheduleCleanup } from '../schedulers.js';

export interface Message<TType extends string = string, TData = unknown> {
  readonly type: TType;
  readonly data: TData;
}

/**
 * Represents a subscription in the message queue.
 */
export interface MessageSubscription {
  /**
   * The index at which the subscription has yet to pull any messages
   */
  index: number;
  connectionHandler: ConnectionHandler;
}

/**
 * Used to register a subscription on a MessageQueue.
 *
 * During MessageQueue cleanup if a handler returns false, it removes the subscription.
 */
export interface ConnectionHandler {
  (didDisconnect: boolean): boolean;
}

const queuesToClean: MessageQueue<any>[] = [];
let canScheduleCleanup = true;

/**
 * A pull based message queue which holds messages for active subscriber to pull.
 *
 * During cleanup phase if the number of messages in the queue is greater than `maxSize`,
 * subscription which have greater than `maxSize` pending messages will be removed,
 * and in doing so allow messages to be removed from the queue.
 */
export class MessageQueue<TMessage extends Message> {
  #messages: TMessage[] = [];
  #subscriptionLookup = new Map<ConnectionHandler, MessageSubscription>();
  #subscriptions: MessageSubscription[] = [];
  #isScheduledForClean = false;
  #maxSize: number;

  /**
   * @param maxSize Max number of pending messages for a subscription
   */
  constructor(maxSize: number) {
    this.#maxSize = maxSize;
  }

  addMessage(message: TMessage): void {
    if (this.#subscriptions.length === 0) {
      return;
    }
    this.#messages.push(message);

    // Schedule cleaning
    if (this.#isScheduledForClean) {
      return;
    }
    this.#isScheduledForClean = true;
    queuesToClean.push(this);
    if (canScheduleCleanup) {
      canScheduleCleanup = false;
      scheduleCleanup(MessageQueue.#cleanupScheduled);
    }
  }

  subscribe(connectionHandler: ConnectionHandler): void {
    const lookup = this.#subscriptionLookup;
    if (lookup.has(connectionHandler)) {
      return;
    }
    const index = this.#messages.length;
    const sub = { index, connectionHandler };
    this.#subscriptionLookup.set(connectionHandler, sub);
    this.#subscriptions.push(sub);
  }

  pullAll(
    connectionHandler: ConnectionHandler,
    messageHandler: (messages: TMessage[]) => void,
    noMessagesHandler: (isSubscribed: boolean) => void
  ): void {
    const sub = this.#subscriptionLookup.get(connectionHandler);
    if (sub === undefined) {
      noMessagesHandler(false);
      return;
    }

    const messages = this.#messages;
    const totalMessages = messages.length;
    const { index } = sub;
    if (index === totalMessages) {
      noMessagesHandler(true);
      return;
    }
    const pulledMessages = messages.slice(index);
    sub.index = totalMessages;

    messageHandler(pulledMessages);
  }

  pullFromFirst(
    connectionHandler: ConnectionHandler,
    messageHandler: (message: TMessage, remaining: number) => boolean,
    noMessagesHandler: (isSubscribed: boolean) => void
  ): void {
    const sub = this.#subscriptionLookup.get(connectionHandler);
    if (sub === undefined) {
      noMessagesHandler(false);
      return;
    }

    const messages = this.#messages;
    const { index } = sub;
    const end = messages.length;
    if (index === end) {
      noMessagesHandler(true);
      return;
    }
    const lastIndex = end - 1;
    let keepAlive = true;
    let i = index;
    while (keepAlive && i < end) {
      const message = messages[i]!;
      keepAlive = messageHandler(message, lastIndex - i);
      i++;
    }
    sub.index = i;
  }

  pullFromLast(
    connectionHandler: ConnectionHandler,
    messageHandler: (message: TMessage, remaining: number) => boolean,
    noMessagesHandler: (isSubscribed: boolean) => void
  ) {
    const sub = this.#subscriptionLookup.get(connectionHandler);
    if (sub === undefined) {
      noMessagesHandler(false);
      return;
    }

    const messages = this.#messages;
    const { index } = sub;
    const end = messages.length;
    if (index === end) {
      noMessagesHandler(true);
      return;
    }
    const lastIndex = end - 1;
    let keepAlive = true;
    let i = lastIndex;
    while (keepAlive && i < end) {
      const message = messages[i]!;
      keepAlive = messageHandler(message, i - index);
      i--;
    }
    sub.index = lastIndex;
  }

  static #cleanupScheduled(): void {
    for (let i = 0; i < queuesToClean.length; i++) {
      const queue = queuesToClean[i]!;
      let minIndex = Infinity;

      const maxSize = queue.#maxSize;
      const messages = queue.#messages;
      const clearIndex = messages.length - maxSize;
      const subscriptions = queue.#subscriptions;
      const subscriptionLookup = queue.#subscriptionLookup;
      const activeSubs: MessageSubscription[] = [];
      queue.#subscriptions = activeSubs;
      for (let j = 0; j < subscriptions.length; j++) {
        const sub = subscriptions[j]!;
        const shouldDisconnect = clearIndex > sub.index;
        let isActive: boolean;
        try {
          if (shouldDisconnect) {
            isActive = false;
            sub.connectionHandler(true);
          } else {
            isActive = sub.connectionHandler(false);
          }
        } catch (err) {
          isActive = false;
          //TODO report err
        }
        if (isActive) {
          const { index } = sub;
          if (index < minIndex) {
            minIndex = index;
          }
          activeSubs.push(sub);
        } else {
          subscriptionLookup.delete(sub.connectionHandler);
        }
      }
      if (minIndex === Infinity) {
        messages.length = 0;
      } else if (minIndex > 0) {
        messages.splice(0, minIndex);

        for (let j = 0; j < activeSubs.length; j++) {
          const sub = subscriptions[j]!;
          sub.index = sub.index - minIndex;
        }
      }
    }
    queuesToClean.length = 0;
    canScheduleCleanup = true;
  }
}
