import type { Emitter, EmitterCallback } from './emitter.js';
import { type Particle, emitterKey } from './particle.js';

export interface DataSensor<TEmitData> extends Particle<TEmitData> {
  emitter: Emitter<TEmitData>;
  send(data: TEmitData): void;
}

export interface Sensor extends Particle<undefined> {
  emitter: Emitter<undefined>;
  send(): void;
}

export function createSensor(): Sensor;
export function createSensor<TEmitData>(): DataSensor<TEmitData>;
export function createSensor<TEmitData>() {
  const callbackMap = new Map<() => void, EmitterCallback<TEmitData>>();

  function send(data: TEmitData) {
    for (const callback of callbackMap.values()) {
      callback(data);
    }
  }

  function emitter(callback: EmitterCallback<TEmitData>) {
    const terminator = () => {
      callbackMap.delete(terminator);
    };

    callbackMap.set(terminator, callback);

    return terminator;
  }

  return {
    send,
    emitter,
    [emitterKey]: emitter,
  };
}
