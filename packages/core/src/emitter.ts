import { emitterKey, type Particle } from './particle.js';

export interface Disposer {
  (): void;
}
export type EmitHandler<TEmitData> = (data: TEmitData) => void;

export interface Emitter<TEmitData = unknown> extends Particle<TEmitData> {
  (callback: EmitHandler<TEmitData>): Disposer;
}

// TODO: make this platform agnostic
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
    const handlerWrapper: { handler?: EmitHandler<unknown> } = { handler };

    const disposer = () => {
      handlerWrapper.handler = undefined;
      if (cleanId === undefined) {
        cleanId = window.requestIdleCallback(clean);
      }
    };

    handlers.push(handlerWrapper);

    return disposer;
  }
  (emitter as any)[emitterKey] = emitter;

  return [emitter as Emitter, send];
}
