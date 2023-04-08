import type { Emitter } from './emitter';

export const emitterKey = Symbol('metron-emitter');

export interface Particle<T = unknown> {
  readonly [emitterKey]: Emitter<T>;
}

export const valueOfKey = Symbol('metron-value-of');

export interface ValueParticle<V = unknown, T = unknown> extends Particle<T> {
  [valueOfKey](): V;
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
