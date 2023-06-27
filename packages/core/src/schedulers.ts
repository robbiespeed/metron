interface Scheduler {
  (callback: () => void): void;
}

const defaultScheduler: Scheduler = (callback) =>
  Promise.resolve().then(callback);

export let scheduleCleanup: Scheduler = defaultScheduler;
export let scheduleMicroTask: Scheduler = defaultScheduler;

export function setCleanupScheduler(scheduler: Scheduler) {
  scheduleCleanup = scheduler;
}
export function setMicroTaskScheduler(scheduler: Scheduler) {
  scheduleMicroTask = scheduler;
}

export function promiseCleanup() {
  return new Promise<void>(scheduleCleanup);
}

export function promiseMicroTask() {
  return new Promise<void>(scheduleMicroTask);
}
