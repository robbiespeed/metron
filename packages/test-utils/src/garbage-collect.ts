/* c8 ignore next 6 */
export const garbageCollect =
  global.gc &&
  (async () => {
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 0));
    global.gc!();
  });
