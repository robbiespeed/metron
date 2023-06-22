interface Scheduler {
  (callback: () => void): void;
}

export let scheduleCleanup: Scheduler = (cleanup) =>
  Promise.resolve().then(cleanup);

export function setCleanupScheduler(scheduler: Scheduler) {
  scheduleCleanup = scheduler;
}
