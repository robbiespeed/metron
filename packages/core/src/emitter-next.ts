import type { Disposer } from './shared.js';

interface Subscription {
  handler: () => undefined;
  next?: Subscription;
  prev?: Subscription;
}

const disposedHandler = (): undefined => {};

export class Emitter {
  #canSchedule = true;
  #subscriptionHead?: Subscription;
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

    return Emitter.#disposer.bind(this, sub);
  }
  static Channel = class EmitterCannel {
    #queue: Emitter[] = [];
    #errorHandler: (cause: unknown) => void;
    constructor(errorHandler: (cause: unknown) => void) {
      this.#errorHandler = errorHandler;
    }
    // TODO: make this a public method of Channel instance
    static #emit(this: EmitterCannel, emitter: Emitter): undefined {
      if (emitter.#canSchedule) {
        emitter.#canSchedule = false;
        this.#queue.push(emitter);
      }
    }

    run() {
      const queue = this.#queue;
      for (let i = 0; i < queue.length; i++) {
        const emitter = queue[i]!;
        let next = emitter.#subscriptionHead;
        while (next) {
          try {
            next.handler();
          } catch (err) {
            this.#errorHandler(err);
          }
          next = next.next;
        }
        emitter.#canSchedule = true;
      }
      queue.length = 0;
    }

    // TODO: Remove this use new Emitter instead. And call channel.emit(emitter)
    createEmitter(): {
      emitter: Emitter;
      emit: () => undefined;
    } {
      const emitter = new Emitter();
      return { emitter, emit: EmitterCannel.#emit.bind(this, emitter) };
    }
  };
  static #disposer(this: Emitter, sub: Subscription): undefined {
    if (sub.handler === disposedHandler) {
      return;
    }
    sub.handler = disposedHandler;
    const { prev } = sub;
    if (prev === undefined) {
      this.#subscriptionHead = sub.next;
    } else {
      prev.next = sub.next;
    }
  }
}

// TODO: remove this!!! And move all below into a platform dependant or configurable runtime file
declare const console: any;

const defaultEmitChannel = new Emitter.Channel((cause) => {
  console.error(cause);
});

// TODO: Remove this use new Emitter instead.
export const createEmitter =
  defaultEmitChannel.createEmitter.bind(defaultEmitChannel);

export const run = defaultEmitChannel.run.bind(defaultEmitChannel);
