import type { Emitter, EmitterCallback } from './emitter.js';
import { type Particle, emitterKey } from './particle.js';

export interface DataSensor<T> extends Particle<T> {
  emitter: Emitter<T>;
  send(data: T): void;
}

export interface RawSensor extends Particle<undefined> {
  emitter: Emitter<undefined>;
  send(): void;
}

export function createSensor(): RawSensor;
export function createSensor<T>(): DataSensor<T>;
export function createSensor<T>() {
  const callbackMap = new Map<() => void, EmitterCallback<T>>();

  function send(data: T) {
    for (const callback of callbackMap.values()) {
      callback(data);
    }
  }

  function emitter(callback: EmitterCallback<T>) {
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
