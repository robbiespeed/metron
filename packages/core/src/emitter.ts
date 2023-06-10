import { emitterKey, type Particle } from './particle.js';

export type EmitterCallback<TEmitData> = (data: TEmitData) => void;

export interface Emitter<TEmitData = unknown> extends Particle<TEmitData> {
  (callback: EmitterCallback<TEmitData>): () => void;
}

export function createEmitter(): [Emitter<undefined>, () => void];
export function createEmitter<TEmitData>(): [
  Emitter<TEmitData>,
  (message: TEmitData) => void
];
export function createEmitter(): [Emitter, (message: unknown) => void] {
  const callbackMap = new Map<() => void, EmitterCallback<unknown>>();

  function send(data: unknown) {
    for (const callback of callbackMap.values()) {
      callback(data);
    }
  }

  function emitter(callback: EmitterCallback<unknown>) {
    const terminator = () => {
      callbackMap.delete(terminator);
    };

    callbackMap.set(terminator, callback);

    return terminator;
  }
  (emitter as any)[emitterKey] = emitter;

  return [emitter as Emitter, send];
}
