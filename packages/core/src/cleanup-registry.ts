export const cleanupRegistry = new FinalizationRegistry(
  (cleanup: () => undefined) => cleanup()
);
