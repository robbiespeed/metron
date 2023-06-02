import { createSensor } from './sensor.js';
import type { Emitter } from './emitter.js';
import {
  emitterKey,
  type Particle,
  type ParticleOrNonParticle,
  valueOfKey,
  type Atom,
} from './particle.js';

const orbEmitterKey = Symbol('orb');

export interface OrbConnector {
  (...particles: Particle[]): void;
  emitters(...emitters: Emitter[]): void;
}

export interface OrbEmitter<TEmitData = unknown> extends Emitter<TEmitData> {
  [orbEmitterKey]?: Orb;
}

// TODO: derived has similar types, they could be shared
type ValueFromParticles<T extends readonly Atom[]> = {
  [K in keyof T]: ReturnType<T[K][typeof valueOfKey]>;
};

type ValueFromMaybeParticle<T> = T extends Atom
  ? ReturnType<T[typeof valueOfKey]>
  : T;

type ValueFromMaybeParticles<T extends readonly ParticleOrNonParticle[]> = {
  [K in keyof T]: ValueFromMaybeParticle<T[K]>;
};

export interface OrbContext {
  get<const T extends readonly Atom[]>(...particles: T): ValueFromParticles<T>;
  versatileGet<const T extends readonly ParticleOrNonParticle[]>(
    ...maybeParticles: T
  ): ValueFromMaybeParticles<T>;
  /**
   * Connects the particle to the orb, triggering the orb to change when the
   * particle changes
   */
  connect(...particles: Particle[]): void;
  versatileConnect(...items: ParticleOrNonParticle[]): void;
}

export interface Orb extends Particle<undefined> {
  context: OrbContext;
  watch: Emitter<undefined>;
  start(): void;
  stop(): void;
  clearWatched(): void;
  addDependentEmitter(emitter: Emitter): void;
  removeDependentEmitter(emitter: Emitter): void;
  stabilityEmitter: Emitter<undefined>;
  stabilize(): void;
}

interface Tracker {
  terminator: () => void;
  emitter: OrbEmitter;
  isActive: boolean;
  entangledOrb?: Orb;
}

export interface OrbOptions {
  // TODO: This may not be needed if the only use is for reactor
  signalScheduler?: (callback: () => void) => void;
  autoStabilize?: boolean;
  autoStart?: boolean;
}

const defaultOptions = {
  autoStabilize: true,
  autoStart: true,
};

export function createOrb(options?: OrbOptions): Orb {
  const { signalScheduler, autoStart, autoStabilize } = {
    ...defaultOptions,
    ...options,
  };

  let trackers: Tracker[] = [];
  let activeTrackerCount = 0;

  let dependentStableCount = 0;
  let dependentStableCountGoal = 0;
  const dependentStabilityEmitters = new Map<Emitter, () => void>();

  let isOn = autoStart;
  let onStart: (() => void) | undefined;

  const trackerMap = new Map<Emitter, Tracker>();
  const sensor = createSensor();
  const stabilitySensor = createSensor();

  const sendStableSignal = stabilitySensor.send;
  const stabilityEmitter = stabilitySensor[emitterKey];

  let isStable = true;

  function stabilize() {
    if (isStable) {
      return;
    }

    isStable = true;

    // In the event that a stabilization happens between the signal being
    // dispatched and sent. During this time all trackers would be inactive,
    // so all would be terminated.
    // Clean should skip if all trackers are active
    if (isSignalDispatched || activeTrackerCount === trackers.length) {
      sendStableSignal();
      return;
    }

    const lastTrackers = trackers;
    trackers = [];
    for (const tracker of lastTrackers) {
      if (tracker.isActive) {
        trackers.push(tracker);
        continue;
      }
      tracker.terminator();
      trackerMap.delete(tracker.emitter);

      const { entangledOrb } = tracker;
      if (entangledOrb) {
        entangledOrb.removeDependentEmitter(stabilityEmitter);
      }
    }

    sendStableSignal();
  }

  function runAutoStabilize() {
    if (dependentStableCount === dependentStableCountGoal) {
      stabilize();
    }
  }

  let isSignalDispatched = false;

  const sendSignal = autoStabilize
    ? () => {
        sensor.send();
        isSignalDispatched = false;
        runAutoStabilize();
      }
    : () => {
        sensor.send();
        isSignalDispatched = false;
      };

  const _dispatchSignal = signalScheduler
    ? () => signalScheduler(sendSignal)
    : sendSignal;

  const onStartDispatchSignal = () => {
    onStart = _dispatchSignal;
  };

  let dispatchSignal = isOn ? _dispatchSignal : onStartDispatchSignal;

  function watchUpdate() {
    activeTrackerCount = 0;

    for (const tracker of trackers) {
      tracker.isActive = false;
    }

    // Destabilize whenever something watched has changed
    dependentStableCount = 0;
    isStable = false;

    // If signal is already dispatched we don't dispatch another
    if (isSignalDispatched) {
      return;
    }

    isSignalDispatched = true;
    dispatchSignal();
  }

  function connectEmitter(emitter: OrbEmitter) {
    const existingTracker = trackerMap.get(emitter);
    if (existingTracker) {
      if (existingTracker.isActive) {
        return;
      }

      existingTracker.isActive = true;
      activeTrackerCount++;

      return;
    }

    const entangledOrb = emitter[orbEmitterKey];

    if (entangledOrb) {
      entangledOrb.addDependentEmitter(stabilityEmitter);
    }

    const tracker: Tracker = {
      terminator: emitter(() => {
        if (tracker.isActive) {
          watchUpdate();
        }
      }),
      emitter,
      entangledOrb,
      isActive: true,
    };

    activeTrackerCount++;
    trackers.push(tracker);

    trackerMap.set(emitter, tracker);
  }

  function connect(...particles: Particle[]) {
    for (const { [emitterKey]: emitter } of particles) {
      connectEmitter(emitter);
    }
  }

  function versatileConnect(...maybeParticles: ParticleOrNonParticle[]) {
    for (const { [emitterKey]: emitter } of maybeParticles) {
      if (emitter) {
        connectEmitter(emitter);
      }
    }
  }

  function get<const T extends readonly Atom[]>(
    ...particles: T
  ): ValueFromParticles<T> {
    return particles.map((p) => {
      connectEmitter(p[emitterKey]);

      return p[valueOfKey]();
    }) as ValueFromParticles<T>;
  }

  function versatileGet<const T extends readonly ParticleOrNonParticle[]>(
    ...maybeParticles: T
  ): ValueFromMaybeParticles<T> {
    return maybeParticles.map((p) => {
      const emitter = p[emitterKey];
      const valueOf = p[valueOfKey];

      if (emitter) {
        connectEmitter(emitter);
      }
      if (valueOf) {
        return valueOf();
      }

      return p;
    }) as ValueFromMaybeParticles<T>;
  }

  const addDependentEmitter = autoStabilize
    ? (emitter: Emitter) => {
        dependentStableCountGoal++;
        dependentStabilityEmitters.set(
          emitter,
          emitter(() => {
            dependentStableCount++;
            runAutoStabilize();
          })
        );
      }
    : (emitter: Emitter) => {
        dependentStableCountGoal++;
        dependentStabilityEmitters.set(
          emitter,
          emitter(() => {
            dependentStableCount++;
          })
        );
      };

  const _removeDependentEmitter = (emitter: Emitter) => {
    dependentStableCountGoal--;
    const terminator = dependentStabilityEmitters.get(emitter);
    if (terminator) {
      terminator();
    }
    dependentStabilityEmitters.delete(emitter);
  };

  const removeDependentEmitter = autoStabilize
    ? (emitter: Emitter) => {
        _removeDependentEmitter(emitter);
        runAutoStabilize();
      }
    : _removeDependentEmitter;

  const orbEmitter = sensor[emitterKey];

  return {
    context: {
      connect,
      get,
      versatileConnect,
      versatileGet,
    },
    [emitterKey]: orbEmitter,
    watch: orbEmitter,
    start() {
      isOn = true;
      dispatchSignal = _dispatchSignal;
      if (onStart) {
        onStart();
        onStart = undefined;
      }
    },
    stop() {
      isOn = false;
      dispatchSignal = onStartDispatchSignal;
    },
    clearWatched() {
      for (const tracker of trackers) {
        tracker.terminator();

        const { entangledOrb } = tracker;
        if (entangledOrb) {
          entangledOrb.removeDependentEmitter(stabilityEmitter);
        }
      }
      trackerMap.clear();
      trackers = [];
    },
    stabilize,
    stabilityEmitter,
    addDependentEmitter,
    removeDependentEmitter,
  };
}

export function entangleOrbWithEmitter(orb: Orb, emitter: OrbEmitter) {
  emitter[orbEmitterKey] = orb;
}
