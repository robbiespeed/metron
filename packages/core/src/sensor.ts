import { createEmitter, type Emitter } from './emitter.js';
import { type Particle, emitterKey } from './particle.js';

// TODO: remove all sensor instances and replace with createEmitter

export interface DataSensor<TEmitData> extends Particle<TEmitData> {
  emitter: Emitter<TEmitData>;
  send(data: TEmitData): void;
}

export interface Sensor extends Particle<undefined> {
  emitter: Emitter<undefined>;
  send(): void;
}

/**
 * @deprecated Use `createEmitter` instead
 */
function createSensor(): Sensor;
/**
 * @deprecated Use `createEmitter` instead
 */
function createSensor<TEmitData>(): DataSensor<TEmitData>;
function createSensor<TEmitData>() {
  const [emitter, send] = createEmitter<TEmitData>();

  return {
    send,
    emitter,
    [emitterKey]: emitter,
  } satisfies Sensor | DataSensor<TEmitData>;
}

export { createSensor };
