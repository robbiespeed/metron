import { emitterKey, type Particle } from './particle.js';

export type EmitHandler<TEmitData> = (data: TEmitData) => void;

export interface Emitter<TEmitData = unknown> extends Particle<TEmitData> {
  (callback: EmitHandler<TEmitData>): () => void;
}

// const NO_OP_TERMINATOR = () => {};

export function createEmitter(): [Emitter<undefined>, () => void];
export function createEmitter<TEmitData>(): [
  Emitter<TEmitData>,
  (message: TEmitData) => void
];
export function createEmitter(): [Emitter, (message: unknown) => void] {
  const handlers = new Map<() => void, EmitHandler<unknown>>();
  // const weakHandlers = new WeakRef(handlers);

  function send(data: unknown) {
    for (const callback of handlers.values()) {
      callback(data);
    }
  }

  function emitter(callback: EmitHandler<unknown>) {
    // const handlersMaybe = weakHandlers.deref();

    // if (handlersMaybe === undefined) {
    //   return NO_OP_TERMINATOR;
    // }

    // const terminator = () => {
    //   weakHandlers.deref()?.delete(terminator);
    // };

    // handlersMaybe.set(terminator, callback);

    const terminator = () => {
      handlers.delete(terminator);
    };

    handlers.set(terminator, callback);

    return terminator;
  }
  Object.defineProperty(emitter, emitterKey, {
    get(this: Emitter) {
      return this;
    },
  });

  return [emitter as Emitter, send];
}
