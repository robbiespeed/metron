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

export type { MessageQueue };

const queuesToClean: MessageQueue<any>[] = [];

/**
 * A pull based message queue which holds messages for active subscriber to pull.
 *
 * During cleanup phase if the number of messages in the queue is greater than `maxSize`,
 * subscription which have greater than `maxSize` pending messages will be removed,
 * and in doing so allow messages to be removed from the queue.
 */
class MessageQueue<TMessage extends Message> {
  #messages: TMessage[] = [];
  #subscriptionLookup = new Map<ConnectionHandler, MessageSubscription>();
  #subscriptions: MessageSubscription[] = [];
  #isScheduledForClean = false;
  // TODO: remove message queue and replace with change set manager
  #maxSize: number = 1;

  private constructor() {}

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

  pull(
    connectionHandler: ConnectionHandler,
    messageHandler: (message: TMessage, remaining: number) => boolean,
    noMessagesHandler: (isSubscribed: boolean) => void
  ): void {
    // TODO: shrink before pull
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

    // Artificial limit to 1 message due to synchronization bug, act as if connection died
    if (index !== end - 1) {
      noMessagesHandler(false);
      return;
    }
    messageHandler(messages[index]!, 0);
    sub.index = end;
  }

  purge(connectionHandler: ConnectionHandler): void {
    const sub = this.#subscriptionLookup.get(connectionHandler);
    if (sub !== undefined) {
      sub.index = this.#messages.length;
    }
  }

  static runCleanup = (): void => {
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
      queue.#isScheduledForClean = false;
    }
    queuesToClean.length = 0;
  };

  static #bindableAddMessage<TMessage extends Message>(
    this: MessageQueue<TMessage>,
    message: TMessage
  ): void {
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
  }

  static create<TMessage extends Message>(): {
    queue: MessageQueue<TMessage>;
    addMessage: (message: TMessage) => void;
  } {
    const queue = new MessageQueue<TMessage>();
    return {
      queue,
      addMessage: MessageQueue.#bindableAddMessage.bind(queue),
    };
  }
}

/**
 * Create a {@link MessageQueue} instance and associated addMessage function
 *
 * @param maxSize Max number of pending messages for a subscription
 */
export const createMessageQueue = MessageQueue.create;

export const runMessageQueueCleanup = MessageQueue.runCleanup;
