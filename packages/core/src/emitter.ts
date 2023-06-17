import { emitterKey, type Particle } from './particle.js';

export type EmitHandler<TEmitData> = (data: TEmitData) => void;

export interface Emitter<TEmitData = unknown> extends Particle<TEmitData> {
  (callback: EmitHandler<TEmitData>): () => void;
}

// const NO_OP_TERMINATOR = () => {};

// TODO: store handlers in ({ handler })[] terminator sets handler to undefined. Then scheduled cleanup task with requestIdle or setTimeout removes all empty handlers

declare const window: {
  requestIdleCallback(
    callback: () => void,
    options?: { timeout: number }
  ): number;
};

export function createEmitter(): [Emitter<undefined>, () => void];
export function createEmitter<TEmitData>(): [
  Emitter<TEmitData>,
  (message: TEmitData) => void
];
export function createEmitter(): [Emitter, (message: unknown) => void] {
  let handlers: { handler?: EmitHandler<unknown> }[] = [];
  // const handlersOld = new Map<() => void, EmitHandler<unknown>>();
  // const weakHandlers = new WeakRef(handlers);

  function send(data: unknown) {
    for (const { handler } of handlers) {
      handler?.(data);
    }
  }

  let cleanId: number | undefined;
  function clean() {
    handlers = handlers.filter((h) => h.handler !== undefined);
  }

  function emitter(handler: EmitHandler<unknown>) {
    // const handlersMaybe = weakHandlers.deref();

    // if (handlersMaybe === undefined) {
    //   return NO_OP_TERMINATOR;
    // }

    // const terminator = () => {
    //   weakHandlers.deref()?.delete(terminator);
    // };

    // handlersMaybe.set(terminator, callback);

    const handlerWrapper: { handler?: EmitHandler<unknown> } = { handler };

    const terminator = () => {
      handlerWrapper.handler = undefined;
      if (cleanId === undefined) {
        cleanId = window.requestIdleCallback(clean);
      }
    };

    handlers.push(handlerWrapper);

    return terminator;
  }
  Object.defineProperty(emitter, emitterKey, {
    get(this: Emitter) {
      return this;
    },
  });

  return [emitter as Emitter, send];
}
