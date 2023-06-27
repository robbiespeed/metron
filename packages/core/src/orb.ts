import { createEmitter, type Emitter } from './emitter.js';
import {
  emitterKey,
  type Particle,
  type ParticleOrNonParticle,
  toValueKey,
  type Atom,
  immediateEmitterKey,
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
  get: {
    <const T extends readonly Atom[]>(...particles: T): ValueFromParticles<T>;
    multiform<const T extends readonly ParticleOrNonParticle[]>(
      ...maybeParticles: T
    ): ValueFromMaybeParticles<T>;
  };
  /**
   * Connects the particle to the orb, triggering the orb to change when the
   * particle changes
   */
  connect: {
    (...particles: Particle[]): void;
    multiform(...items: ParticleOrNonParticle[]): void;
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
      connectEmitter(p[immediateEmitterKey] ?? p[emitterKey]);
    }
  }
  connect.multiform = (...maybeParticles: ParticleOrNonParticle[]) => {
    for (const p of maybeParticles) {
      const emitter = p[immediateEmitterKey] ?? p[emitterKey];
      if (emitter) {
        connectEmitter(emitter);
      }
    }
  };

  function get<const T extends readonly Atom[]>(
    ...particles: T
  ): ValueFromParticles<T> {
    return particles.map((p) => {
      connectEmitter(p[immediateEmitterKey] ?? p[emitterKey]);

      return p[toValueKey]();
    }) as ValueFromParticles<T>;
  }
  get.multiform = <const T extends readonly ParticleOrNonParticle[]>(
    ...maybeParticles: T
  ): ValueFromMaybeParticles<T> => {
    return maybeParticles.map((p) => {
      const emitter = p[immediateEmitterKey] ?? p[emitterKey];

      if (emitter) {
        connectEmitter(emitter);
        const valueOf = p[toValueKey];
        if (valueOf) {
          return valueOf();
        }
      }

      return p;
    }) as ValueFromMaybeParticles<T>;
  };

  return {
    context: {
      connect,
      get,
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
