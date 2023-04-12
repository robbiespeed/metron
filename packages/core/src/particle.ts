import type { Emitter } from './emitter.js';

export const emitterKey = Symbol('metron-emitter');

export interface Particle<TEmitData = unknown> {
  readonly [emitterKey]: Emitter<TEmitData>;
}

export const valueOfKey = Symbol('metron-value-of');

export interface ValueParticle<TValue = unknown, TEmitData = unknown>
  extends Particle<TEmitData> {
  [valueOfKey](): TValue;
}

export interface MaybeValueParticle extends Particle {
  [valueOfKey]?: () => unknown;
}

type Primitive = symbol | string | number | bigint | boolean | undefined | null;

interface AntiParticle {
  [emitterKey]?: never;
  [valueOfKey]?: never;
}

export type NotParticle = AntiParticle | (AntiParticle & Primitive);

export type MaybeParticle = MaybeValueParticle | NotParticle;
