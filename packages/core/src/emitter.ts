import type { Disposer } from './shared.js';

interface Subscription {
  handler: () => undefined;
  next?: Subscription;
  prev?: Subscription;
}

const disposedHandler = (): undefined => {};

// TODO: remove this!!!
declare const console: any;

class Emitter {
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
  static #emit(this: Emitter): undefined {
    if (this.#canSchedule) {
      this.#canSchedule = false;
      Emitter.#scheduled.push(this);
    }
  }
  static #scheduled: Emitter[] = [];
  static runEmits = (): undefined => {
    const scheduled = this.#scheduled;
    for (let i = 0; i < scheduled.length; i++) {
      const emitter = scheduled[i]!;
      let next = emitter.#subscriptionHead;
      while (next) {
        try {
          next.handler();
        } catch (err) {
          // TODO report uncaught async err through global event system
          console.error(err);
        }
        next = next.next;
      }
      emitter.#canSchedule = true;
    }
    scheduled.length = 0;
  };
  static create(): {
    emitter: Emitter;
    emit: () => undefined;
  } {
    const emitter = new Emitter();
    return { emitter, emit: Emitter.#emit.bind(emitter) };
  }
}

export type { Emitter };

export const createEmitter = Emitter.create;

export const runEmits = Emitter.runEmits;
