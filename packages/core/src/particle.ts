import { scheduleMicroTask } from './schedulers.js';
import type { SignalNode, Disposer } from './signal-node.js';

export const signalKey = Symbol('MetronSignal');

export interface Particle {
  readonly [signalKey]: SignalNode;
}

export const toValueKey = Symbol('MetronToValue');

export interface Atom<TValue = unknown> extends Particle {
  [toValueKey](): TValue;
}

export type ExtractAtomValue<T> = T extends Atom<infer U> ? U : undefined;
export type ExtractAtomArrayValues<T extends readonly MaybeAtomParticle[]> = [
  ...{
    [K in keyof T]: ExtractAtomValue<T[K]>;
  }
];

// export type ExtractParticleEmit<T> = T extends Particle<infer U>
//   ? U
//   : undefined;
// export type ExtractParticleArrayEmits<T extends readonly Particle[]> = [
//   ...{
//     [K in keyof T]: ExtractParticleEmit<T[K]>;
//   }
// ];

export interface MaybeAtomParticle extends Particle {
  [toValueKey]?: () => unknown;
}

type Primitive = symbol | string | number | bigint | boolean | undefined | null;

interface AntiParticle {
  [signalKey]?: never;
  [toValueKey]?: never;
}

export type NonParticle = AntiParticle | (AntiParticle & Primitive);

export type ParticleOrNonParticle = MaybeAtomParticle | NonParticle;

export function isParticle(value: unknown): value is Particle {
  return (value as any)?.[signalKey] !== undefined;
}

export function isAtom(value: unknown): value is Atom {
  return (value as any)?.[toValueKey] !== undefined;
}

export function untracked<T>(atom: Atom<T>): T {
  return atom[toValueKey]();
}

export function subscribe(particle: Particle, handler: () => void): Disposer {
  return particle[signalKey].subscribe(handler);
}

export function runAndSubscribe(
  particle: Particle,
  handler: () => void
): Disposer {
  handler();
  return particle[signalKey].subscribe(handler);
}

export function microtaskSubscribe(
  particle: Particle,
  handler: () => void
): Disposer {
  let isScheduled = false;
  let isActive = true;
  const disposer = particle[signalKey].subscribe(() => {
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

export function runAndMicrotaskSubscribe(
  particle: Particle,
  handler: () => void
): Disposer {
  handler();
  let isScheduled = false;
  let isActive = true;
  const disposer = particle[signalKey].subscribe(() => {
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
