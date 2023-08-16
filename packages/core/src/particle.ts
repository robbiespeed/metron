import type { Disposer, EmitHandler, Emitter } from './emitter.js';
import { scheduleMicroTask } from './schedulers.js';

export const emitterKey = Symbol('MetronEmitter');

export interface Particle<TEmitData = void> {
  readonly [emitterKey]: Emitter<TEmitData>;
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
): Disposer {
  return particle[emitterKey](handler);
}

export function runAndSubscribe<TEmit>(
  particle: Particle<TEmit>,
  handler: EmitHandler<TEmit | void>
): Disposer {
  handler();
  return particle[emitterKey](handler);
}

export function microtaskSubscribe<TEmit>(
  particle: Particle<TEmit>,
  handler: EmitHandler<void>
): Disposer {
  let isScheduled = false;
  let isActive = true;
  const disposer = particle[emitterKey](() => {
    if (isScheduled) {
      return;
    }
    isScheduled = true;
    scheduleMicroTask(() => {
      if (isActive) {
        handler();
        isScheduled = false;
      }
    });
  });

  return () => {
    disposer();
    isActive = false;
  };
}

export function runAndMicrotaskSubscribe<TEmit>(
  particle: Particle<TEmit>,
  handler: EmitHandler<void>
): Disposer {
  handler();
  let isScheduled = false;
  let isActive = true;
  const disposer = particle[emitterKey](() => {
    if (isScheduled) {
      return;
    }
    isScheduled = true;
    scheduleMicroTask(() => {
      if (isActive) {
        handler();
        isScheduled = false;
      }
    });
  });

  return () => {
    disposer();
    isActive = false;
  };
}
