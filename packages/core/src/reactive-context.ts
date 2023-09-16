import {
  signalKey,
  type Atom,
  type Particle,
  toValueKey,
  type ParticleOrNonParticle,
} from './particle.js';
import type { SignalNode } from './signal-node.js';

// TODO: derived has similar types, they could be shared
type ValueFromParticles<T extends readonly Atom<any>[]> = {
  [K in keyof T]: ReturnType<T[K][typeof toValueKey]>;
};
type ValueFromMaybeParticle<T> = T extends Atom<any>
  ? ReturnType<T[typeof toValueKey]>
  : T;
type ValueFromMaybeParticles<T extends readonly ParticleOrNonParticle[]> = {
  [K in keyof T]: ValueFromMaybeParticle<T[K]>;
};

export interface ReactiveContext {
  readAll: {
    <const T extends readonly Atom<any>[]>(
      ...particles: T
    ): ValueFromParticles<T>;
    any<const T extends readonly ParticleOrNonParticle[]>(
      ...maybeParticles: T
    ): ValueFromMaybeParticles<T>;
  };
  read: {
    <const T>(particle: Atom<T>): T;
    any<const T extends ParticleOrNonParticle>(
      maybeParticle: T
    ): ValueFromMaybeParticle<T>;
  };
  /**
   * Connects the particle to the orb, triggering the orb to change when the
   * particle changes
   */
  connect: {
    (...particles: Particle[]): void;
    any(...items: ParticleOrNonParticle[]): void;
  };
}

export interface AsyncReactiveContext extends ReactiveContext {
  done(): void;
}

export function createReactiveContext(signalNode: SignalNode): ReactiveContext {
  function connect(...particles: Particle[]) {
    for (const p of particles) {
      signalNode.recordSource(p[signalKey]);
    }
  }
  function connectAny(...maybeParticles: ParticleOrNonParticle[]) {
    for (const p of maybeParticles) {
      const emitter = p[signalKey];
      if (emitter) {
        signalNode.recordSource(emitter);
      }
    }
  }
  connect.any = connectAny;

  function read<const T>(particle: Atom<T>): T {
    signalNode.recordSource(particle[signalKey]);
    return particle[toValueKey]();
  }
  function readAny<const T extends ParticleOrNonParticle>(
    maybeParticle: T
  ): ValueFromMaybeParticle<T> {
    const emitter = maybeParticle[signalKey];
    if (emitter) {
      signalNode.recordSource(emitter);
      const valueOf = maybeParticle[toValueKey];
      if (valueOf) {
        return valueOf() as any;
      }
    }

    return maybeParticle as any;
  }
  read.any = readAny;

  function readAll<const T extends readonly Atom[]>(
    ...particles: T
  ): ValueFromParticles<T> {
    return particles.map(read) as ValueFromParticles<T>;
  }
  function readAllAny<const T extends readonly ParticleOrNonParticle[]>(
    ...maybeParticles: T
  ) {
    return maybeParticles.map(readAny) as ValueFromMaybeParticles<T>;
  }
  readAll.any = readAllAny;

  return {
    connect,
    read,
    readAll,
  };
}

export function createAsyncReactiveContext(
  signalNode: SignalNode<any>
): AsyncReactiveContext {
  let isActive = true;
  function connect(...particles: Particle[]) {
    if (isActive) {
      for (const p of particles) {
        signalNode.recordSource(p[signalKey]);
      }
    }
  }
  function connectAny(...maybeParticles: ParticleOrNonParticle[]) {
    if (isActive) {
      for (const p of maybeParticles) {
        const emitter = p[signalKey];
        if (emitter) {
          signalNode.recordSource(emitter);
        }
      }
    }
  }
  connect.any = connectAny;

  function read<const T>(particle: Atom<T>): T {
    if (isActive) {
      signalNode.recordSource(particle[signalKey]);
    }
    return particle[toValueKey]();
  }
  function readAny<const T extends ParticleOrNonParticle>(
    maybeParticle: T
  ): ValueFromMaybeParticle<T> {
    const emitter = maybeParticle[signalKey];
    if (emitter) {
      if (isActive) {
        signalNode.recordSource(emitter);
      }
      const valueOf = maybeParticle[toValueKey];
      if (valueOf) {
        return valueOf() as any;
      }
    }

    return maybeParticle as any;
  }
  read.any = readAny;

  function readAll<const T extends readonly Atom[]>(
    ...particles: T
  ): ValueFromParticles<T> {
    return particles.map(read) as ValueFromParticles<T>;
  }
  function readAllAny<const T extends readonly ParticleOrNonParticle[]>(
    ...maybeParticles: T
  ) {
    return maybeParticles.map(readAny) as ValueFromMaybeParticles<T>;
  }
  readAll.any = readAllAny;

  return {
    connect,
    read,
    readAll,
    done() {
      isActive = false;
    },
  };
}
