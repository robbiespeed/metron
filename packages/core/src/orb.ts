import { createEmitter, type Emitter } from './emitter.js';
import {
  emitterKey,
  type Particle,
  type ParticleOrNonParticle,
  toValueKey,
  type Atom,
} from './particle.js';

// TODO: derived has similar types, they could be shared
type ValueFromParticles<T extends readonly Atom[]> = {
  [K in keyof T]: ReturnType<T[K][typeof toValueKey]>;
};

type ValueFromMaybeParticle<T> = T extends Atom
  ? ReturnType<T[typeof toValueKey]>
  : T;

type ValueFromMaybeParticles<T extends readonly ParticleOrNonParticle[]> = {
  [K in keyof T]: ValueFromMaybeParticle<T[K]>;
};

export interface OrbContext {
  readAll: {
    <const T extends readonly Atom[]>(...particles: T): ValueFromParticles<T>;
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

export interface Orb extends Particle<undefined> {
  context: OrbContext;
  watch: Emitter;
  start(): void;
  stop(): void;
  dispose(): void;
  stabilize(): void;
  readonly isStable: boolean;
}

interface Tracker {
  dispose: () => void;
  emitter: Emitter;
  isActive: boolean;
}

export interface OrbOptions {
  autoStabilize?: boolean;
  autoStart?: boolean;
}

const defaultOptions = {
  autoStabilize: true,
  autoStart: true,
};

export function createOrb(options?: OrbOptions): Orb {
  const { autoStart, autoStabilize } = {
    ...defaultOptions,
    ...options,
  };

  let trackers: Tracker[] = [];
  let activeTrackerCount = 0;

  let isOn = autoStart;
  let onStart: (() => void) | undefined;

  const trackerMap = new Map<Emitter<unknown>, Tracker>();
  const [orbEmitter, sendOrb] = createEmitter();

  let isStable = true;

  function stabilize() {
    if (isStable) {
      // Do not clean or emit stable
      return;
    }

    // Clean Should be skipped if all trackers are active.
    // Cleaning would have no effect, but still do the work.
    const shouldSkipClean = activeTrackerCount === trackers.length;

    if (!shouldSkipClean) {
      const lastTrackers = trackers;
      trackers = [];
      for (const tracker of lastTrackers) {
        if (tracker.isActive) {
          trackers.push(tracker);
          continue;
        }
        tracker.dispose();
        trackerMap.delete(tracker.emitter);
      }
    }

    isStable = true;
  }

  const sendSignal = autoStabilize
    ? () => {
        sendOrb();
        stabilize();
      }
    : sendOrb;

  const onStartDispatchSignal = () => {
    onStart = sendSignal;
  };

  let dispatchSignal = isOn ? sendSignal : onStartDispatchSignal;

  function watchUpdate() {
    activeTrackerCount = 0;

    for (const tracker of trackers) {
      tracker.isActive = false;
    }

    // Destabilize whenever something watched has changed
    isStable = false;

    dispatchSignal();
  }

  function connectEmitter(emitter: Emitter) {
    const existingTracker = trackerMap.get(emitter);
    if (existingTracker) {
      if (existingTracker.isActive) {
        return;
      }

      existingTracker.isActive = true;
      activeTrackerCount++;

      return;
    }

    const tracker: Tracker = {
      dispose: emitter(() => {
        if (tracker.isActive) {
          watchUpdate();
        }
      }),
      emitter,
      isActive: true,
    };

    activeTrackerCount++;
    trackers.push(tracker);

    trackerMap.set(emitter, tracker);
  }

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
    context: {
      connect,
      read,
      readAll,
    },
    [emitterKey]: orbEmitter,
    watch: orbEmitter,
    start() {
      isOn = true;
      dispatchSignal = sendSignal;
      if (onStart) {
        onStart();
        onStart = undefined;
      }
    },
    stop() {
      isOn = false;
      dispatchSignal = onStartDispatchSignal;
    },
    dispose() {
      for (const tracker of trackers) {
        tracker.dispose();
      }
      trackerMap.clear();
      trackers = [];
    },
    stabilize,
    get isStable() {
      return isStable;
    },
  };
}
