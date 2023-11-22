import { emptyFn, type Disposer } from './shared.js';

export interface EmitMessage<TType extends string = string, TData = unknown> {
  readonly type: TType;
  readonly data: TData;
}

export type EmitMessageOption = void | EmitMessage;

export interface SubscriptionHandler<TEmit extends EmitMessageOption> {
  (message: TEmit): void;
}

interface Subscription<TEmit extends EmitMessageOption> {
  handler: SubscriptionHandler<TEmit>;
  next?: Subscription<TEmit>;
  prev?: Subscription<TEmit>;
}

export interface Subscribable<TEmit extends EmitMessageOption> {
  subscribe(handler: (message: TEmit) => void): Disposer;
}

export class Emitter<TEmit extends EmitMessageOption>
  implements Subscribable<TEmit>
{
  #subscriptionHead?: Subscription<TEmit>;
  subscribe(handler: SubscriptionHandler<TEmit>): Disposer {
    const subHead = this.#subscriptionHead;
    let sub: Subscription<TEmit> | undefined = {
      prev: undefined,
      handler,
      next: subHead,
    };
    if (subHead) {
      subHead.prev = sub;
    }
    this.#subscriptionHead = sub;

    return () => {
      if (sub !== undefined) {
        if (sub.prev) {
          sub.prev.next = sub.next;
        } else {
          this.#subscriptionHead = sub.next;
        }
        sub = undefined;
      }
    };
  }
  static #emit(this: Emitter<any>, message: any): void {
    let next = this.#subscriptionHead;
    while (next) {
      try {
        next.handler(message);
      } catch (err) {
        // TODO: dev mode log
      }
      next = next.next;
    }
  }
  static create<TEmit extends EmitMessageOption = void>(): {
    emitter: Emitter<TEmit>;
    emit(message: TEmit): void;
  } {
    const emitter = new Emitter<TEmit>();
    return { emitter, emit: Emitter.#emit.bind(emitter) };
  }
}

export const createEmitter = Emitter.create;
