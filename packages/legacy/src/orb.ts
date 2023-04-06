import { createSensor, SignalSensor } from "./sensor";
import { Emitter, Particle } from "./types";

export interface OrbConnector {
  (...particles: Particle[]): void;
  emitters(...emitters: Emitter[]): void;
}

export interface Orb extends Particle {
  /**
   * Connects the particle to the orb, triggering the orb to change when the
   * particle changes
   */
  connect: OrbConnector;
  /**
   * Runs the callback when connected particles change
   */
  watch(callback: (connect: OrbConnector) => void): () => void;
  start(): void;
  stop(): void;
  clearWatched(): void;
  addDependentEmitter(emitter: Emitter): void;
  removeDependentEmitter(emitter: Emitter): void;
  stabilityEmitter: Emitter<undefined>;
  stabilize(): void;
}

interface Tracker<T = unknown> {
  terminator: () => void;
  emitter: Emitter<T>;
  isActive: boolean;
  entangledOrb?: Orb;
  data?: T;
}

export interface OrbOptions {
  signalScheduler?: (callback: () => void) => void;
  autoStabilize?: boolean;
  autoStart?: boolean;
}

const defaultOptions = {
  autoStabilize: true,
  autoStart: true,
};

const entangledOrbEmitterMap = new WeakMap<Emitter, Orb>();

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

  const trackerMap: Map<Emitter, Tracker> = new Map();
  const sensor: SignalSensor = createSensor();
  const stabilitySensor: SignalSensor = createSensor();

  const sendStableSignal = stabilitySensor.send;
  const stabilityEmitter = stabilitySensor.watch;

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

  function connectEmitter<T>(emitter: Emitter<T>): T | undefined {
    const existingTracker = trackerMap.get(emitter);
    if (existingTracker) {
      existingTracker.isActive = true;
      activeTrackerCount++;

      const data = existingTracker.data as T | undefined;

      existingTracker.data = undefined;

      return data;
    }

    const entangledOrb = entangledOrbEmitterMap.get(emitter);

    if (entangledOrb) {
      entangledOrb.addDependentEmitter(stabilityEmitter);
    }

    const tracker: Tracker<T> = {
      terminator: emitter((data) => {
        tracker.data = data;
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

  function connectEmitters(...emitters: Emitter[]) {
    for (const emitter of emitters) {
      connectEmitter(emitter);
    }
  }

  function connectParticles(...particles: Particle[]) {
    for (const { watch } of particles) {
      connectEmitter(watch);
    }
  }
  connectParticles.emitters = connectEmitters;

  const connect = connectParticles;

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

  return {
    connect,
    watch(callback) {
      return sensor.watch(() => {
        callback(connect);
      });
    },
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
        trackerMap.delete(tracker.emitter);

        const { entangledOrb } = tracker;
        if (entangledOrb) {
          entangledOrb.removeDependentEmitter(stabilityEmitter);
        }
      }
      trackers = [];
    },
    stabilize,
    stabilityEmitter: stabilityEmitter,
    addDependentEmitter: addDependentEmitter,
    removeDependentEmitter: removeDependentEmitter,
  };
}

export function entangleOrbWithEmitter(orb: Orb, emitter: Emitter) {
  entangledOrbEmitterMap.set(emitter, orb);
}
