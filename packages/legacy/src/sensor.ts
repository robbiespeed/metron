import type { EmitterCallback, Particle } from './types';

export interface DataSensor<T> extends Particle<T> {
  send(data: T): void;
}

export interface SignalSensor extends Particle<undefined> {
  send(): void;
}

/**
 *
 */
export function createSensor(): SignalSensor;
export function createSensor<T>(): DataSensor<T>;
export function createSensor<T>() {
  const callbackMap = new Map<() => void, EmitterCallback<T>>();

  return {
    send(data: T) {
      for (const callback of callbackMap.values()) {
        callback(data);
      }
    },
    watch(callback: EmitterCallback<T>) {
      const terminator = () => {
        callbackMap.delete(terminator);
      };

      callbackMap.set(terminator, callback);

      return terminator;
    },
  };
}
