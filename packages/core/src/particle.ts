import type { EmitHandler, Emitter } from './emitter.js';

export const emitterKey = Symbol('MetronEmitter');
export const immediateEmitterKey = Symbol('MetronPhotonEmitter');

export interface Particle<TEmitData = void> {
  readonly [emitterKey]: Emitter<TEmitData>;
  readonly [immediateEmitterKey]?: Emitter<TEmitData>;
}

export const toValueKey = Symbol('MetronToValue');

export interface Atom<TValue = unknown, TEmitData = void>
  extends Particle<TEmitData> {
  [toValueKey](): TValue;
}

export type ExtractAtomValue<T> = T extends Atom<infer U> ? U : undefined;
export type ExtractAtomArrayValues<T extends readonly MaybeAtomParticle[]> = [
  ...{
    [K in keyof T]: ExtractAtomValue<T[K]>;
  }
];

export type ExtractParticleEmit<T> = T extends Particle<infer U>
  ? U
  : undefined;
export type ExtractParticleArrayEmits<T extends readonly Particle[]> = [
  ...{
    [K in keyof T]: ExtractParticleEmit<T[K]>;
  }
];

export interface MaybeAtomParticle extends Particle {
  [toValueKey]?: () => unknown;
}

type Primitive = symbol | string | number | bigint | boolean | undefined | null;

interface AntiParticle {
  [emitterKey]?: never;
  [immediateEmitterKey]?: never;
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

export function untracked<T>(atom: Atom<T, unknown>): T {
  return atom[toValueKey]();
}

export function subscribe<TEmit>(
  particle: Particle<TEmit>,
  handler: EmitHandler<TEmit>
) {
  return particle[emitterKey](handler);
}

export function runAndSubscribe<TEmit>(
  particle: Particle<TEmit>,
  handler: EmitHandler<TEmit | void>
) {
  handler();
  return particle[emitterKey](handler);
}
