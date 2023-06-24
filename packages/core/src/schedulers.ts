interface Scheduler {
  (callback: () => void): void;
}

const defaultScheduler: Scheduler = (callback) =>
  Promise.resolve().then(callback);

export let scheduleCleanup: Scheduler = defaultScheduler;
export let scheduleTask: Scheduler = defaultScheduler;

export function setCleanupScheduler(scheduler: Scheduler) {
  scheduleCleanup = scheduler;
}
export function setTaskScheduler(scheduler: Scheduler) {
  scheduleTask = scheduler;
}
