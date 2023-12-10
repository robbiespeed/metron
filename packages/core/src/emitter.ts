import type { Disposer } from './shared.js';

interface Subscription {
  handler: () => void;
  next?: Subscription;
  prev?: Subscription;
}

const disposedHandler = () => {};

class Emitter {
  #canSchedule = true;
  #subscriptionHead?: Subscription;
  subscribe(handler: () => void): Disposer {
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
  static #disposer(this: Emitter, sub: Subscription) {
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
  static #emit(this: Emitter): void {
    if (this.#canSchedule) {
      this.#canSchedule = false;
      Emitter.#scheduled.push(this);
    }
  }
  static #scheduled: Emitter[] = [];
  static runEmits = (): void => {
    const scheduled = this.#scheduled;
    for (let i = 0; i < scheduled.length; i++) {
      const emitter = scheduled[i]!;
      let next = emitter.#subscriptionHead;
      while (next) {
        try {
          next.handler();
        } catch (err) {
          // TODO report err
        }
        next = next.next;
      }
      emitter.#canSchedule = true;
    }
    scheduled.length = 0;
  };
  static create(): {
    emitter: Emitter;
    emit: () => void;
  } {
    const emitter = new Emitter();
    return { emitter, emit: Emitter.#emit.bind(emitter) };
  }
}

export type { Emitter };

export const createEmitter = Emitter.create;

export const runEmits = Emitter.runEmits;
