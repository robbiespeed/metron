import {
  emitterKey,
  type Atom,
  type Particle,
  toValueKey,
  type ParticleOrNonParticle,
} from './particle.js';
import { Emitter } from './emitter.js';

// TODO: derived has similar types, they could be shared
type ValueFromParticles<T extends readonly Atom<any, any>[]> = {
  [K in keyof T]: ReturnType<T[K][typeof toValueKey]>;
};
type ValueFromMaybeParticle<T> = T extends Atom<any, any>
  ? ReturnType<T[typeof toValueKey]>
  : T;
type ValueFromMaybeParticles<T extends readonly ParticleOrNonParticle[]> = {
  [K in keyof T]: ValueFromMaybeParticle<T[K]>;
};

export interface ReactiveContext {
  readAll: {
    <const T extends readonly Atom<any, any>[]>(
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
    (...particles: Particle<any>[]): void;
    any(...items: ParticleOrNonParticle[]): void;
  };
}

export interface AsyncReactiveContext extends ReactiveContext {
  done(): void;
}

export function createReactiveContext(
  connectEmitter: (emitter: Emitter<any>) => void
): ReactiveContext {
  function connect(...particles: Particle[]) {
    for (const p of particles) {
      connectEmitter(p[emitterKey]);
    }
  }
  function connectAny(...maybeParticles: ParticleOrNonParticle[]) {
    for (const p of maybeParticles) {
      const emitter = p[emitterKey];
      if (emitter) {
        connectEmitter(emitter);
      }
    }
  }
  connect.any = connectAny;

  function read<const T>(particle: Atom<T>): T {
    connectEmitter(particle[emitterKey]);
    return particle[toValueKey]();
  }
  function readAny<const T extends ParticleOrNonParticle>(
    maybeParticle: T
  ): ValueFromMaybeParticle<T> {
    const emitter = maybeParticle[emitterKey];
    if (emitter) {
      connectEmitter(emitter);
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
  connectEmitter: (emitter: Emitter<any>) => void
): AsyncReactiveContext {
  let isActive = true;
  function connect(...particles: Particle[]) {
    if (isActive) {
      for (const p of particles) {
        connectEmitter(p[emitterKey]);
      }
    }
  }
  function connectAny(...maybeParticles: ParticleOrNonParticle[]) {
    if (isActive) {
      for (const p of maybeParticles) {
        const emitter = p[emitterKey];
        if (emitter) {
          connectEmitter(emitter);
        }
      }
    }
  }
  connect.any = connectAny;

  function read<const T>(particle: Atom<T>): T {
    if (isActive) {
      connectEmitter(particle[emitterKey]);
    }
    return particle[toValueKey]();
  }
  function readAny<const T extends ParticleOrNonParticle>(
    maybeParticle: T
  ): ValueFromMaybeParticle<T> {
    const emitter = maybeParticle[emitterKey];
    if (emitter) {
      if (isActive) {
        connectEmitter(emitter);
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
