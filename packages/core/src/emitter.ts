import { emitterKey, type Particle } from './particle.js';
import { scheduleCleanup } from './schedulers.js';

export interface Disposer {
  (): void;
}
export type EmitHandler<TEmitData> = (data: TEmitData) => void;

export interface Emitter<TEmitData = unknown> extends Particle<TEmitData> {
  (callback: EmitHandler<TEmitData>): Disposer;
}

export function createEmitter(): [Emitter<undefined>, () => void];
export function createEmitter<TEmitData>(): [
  Emitter<TEmitData>,
  (message: TEmitData) => void
];
export function createEmitter(): [Emitter, (message: unknown) => void] {
  const strongHandlers: { handler?: EmitHandler<unknown> }[] = [];
  const weakHandlers = new WeakRef(strongHandlers);

  function send(data: unknown) {
    for (const { handler } of strongHandlers) {
      handler?.(data);
    }
  }

  let canScheduleClean = true;
  function clean() {
    const handlers = weakHandlers.deref();
    if (handlers === undefined) {
      return;
    }
    canScheduleClean = true;

    handlers.splice(
      0,
      handlers.length,
      ...handlers.filter((h) => h.handler !== undefined)
    );
  }

  function emitter(handler: EmitHandler<unknown>) {
    const handlers = weakHandlers.deref();
    if (handlers === undefined) {
      return;
    }

    const handlerWrapper: { handler?: EmitHandler<unknown> } = { handler };

    const disposer = () => {
      handlerWrapper.handler = undefined;
      if (canScheduleClean) {
        canScheduleClean = false;
        scheduleCleanup(clean);
      }
    };

    handlers.push(handlerWrapper);

    return disposer;
  }
  (emitter as any)[emitterKey] = emitter;

  return [emitter as Emitter, send];
}
