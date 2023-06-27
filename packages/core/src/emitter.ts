import { emitterKey, type Particle } from './particle.js';
import { scheduleCleanup } from './schedulers.js';

export interface Disposer {
  (): void;
}
export type EmitHandler<TEmitData> = (data: TEmitData) => void;

export interface Emitter<TEmitData = unknown> extends Particle<TEmitData> {
  (handler: EmitHandler<TEmitData>): Disposer;
}

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

  let canScheduleClean = true;

  function clean() {
    handlers = handlers.filter((h) => h.handler !== undefined);
    canScheduleClean = true;
  }

  function emitter(handler: EmitHandler<unknown>) {
    const handlerWrapper: { handler?: EmitHandler<unknown> } = { handler };
    handlers.push(handlerWrapper);

    return () => {
      handlerWrapper.handler = undefined;
      if (canScheduleClean) {
        canScheduleClean = false;
        scheduleCleanup(clean);
      }
    };
  }
  (emitter as any)[emitterKey] = emitter;

  return [emitter as Emitter, send];
}
