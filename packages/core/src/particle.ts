import type { Emitter } from './emitter.js';

export const emitterKey = Symbol('metron-emitter');

export interface Particle<TEmitData = unknown> {
  readonly [emitterKey]: Emitter<TEmitData>;
}

export const valueOfKey = Symbol('metron-value-of');

export interface Atom<TValue = unknown, TEmitData = unknown>
  extends Particle<TEmitData> {
  [valueOfKey](): TValue;
}

export interface MaybeAtomParticle extends Particle {
  [valueOfKey]?: () => unknown;
}

type Primitive = symbol | string | number | bigint | boolean | undefined | null;

interface AntiParticle {
  [emitterKey]?: never;
  [valueOfKey]?: never;
}

export type NonParticle = AntiParticle | (AntiParticle & Primitive);

export type ParticleOrNonParticle = MaybeAtomParticle | NonParticle;

export function isParticle(value: unknown): value is Particle {
  return (value as any)?.[emitterKey] !== undefined;
}

export function isAtom(value: unknown): value is Atom {
  return (value as any)?.[valueOfKey] !== undefined;
}

export function untracked<T>(atom: Atom<T>): T {
  return atom[valueOfKey]();
}
