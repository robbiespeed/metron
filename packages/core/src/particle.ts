import type { Emitter } from './emitter.js';

export const emitterKey = Symbol('MetronEmitter');

export interface Particle<TEmitData = unknown> {
  readonly [emitterKey]: Emitter<TEmitData>;
}

export const toValueKey = Symbol('MetronToValue');

export interface Atom<TValue = unknown, TEmitData = unknown>
  extends Particle<TEmitData> {
  [toValueKey](): TValue;
}

export interface MaybeAtomParticle extends Particle {
  [toValueKey]?: () => unknown;
}

type Primitive = symbol | string | number | bigint | boolean | undefined | null;

interface AntiParticle {
  [emitterKey]?: never;
  [toValueKey]?: never;
}

export type NonParticle = AntiParticle | (AntiParticle & Primitive);

export type ParticleOrNonParticle = MaybeAtomParticle | NonParticle;

export function isParticle(value: unknown): value is Particle {
  return (value as any)?.[emitterKey] !== undefined;
}

export function isAtom(value: unknown): value is Atom {
  return (value as any)?.[toValueKey] !== undefined;
}

export function untracked<T>(atom: Atom<T>): T {
  return atom[toValueKey]();
}
