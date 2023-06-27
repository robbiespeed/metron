export const cleanupRegistry = new FinalizationRegistry((cleanup: () => void) =>
  cleanup()
);
