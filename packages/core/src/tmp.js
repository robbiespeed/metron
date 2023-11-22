let internalFooBar;

const fooBar = computed(({ connect }) => {
  const foo = fooList.connectedRead(connect, {
    swap({ keySwap: [a, b] }) {
      let tmp = internalFooBar[a];
      internalFooBar[a] = internalFooBar[b];
      internalFooBar[b] = tmp;
    },
  });

  const bar = barList.connectedRead(connect, {
    swap({ keySwap }) {
      const fooSize = foo.size;
      const a = keySwap[0] + fooSize;
      const b = keySwap[1] + fooSize;

      let tmp = internalFooBar[a];
      internalFooBar[a] = internalFooBar[b];
      internalFooBar[b] = tmp;
    },
  });

  internalFooBar = [...foo.toArray(), ...bar.toArray()];

  return internalFooBar;
});

const ab = integrate((connect) => {
  const aReader = a.unwrap();
  const bReader = b.unwrap();
  let internalAB = [...aReader, ...bReader];
  connect(a, {
    swap({ keySwap: [a, b] }) {
      let tmp = internalAB[a];
      internalAB[a] = internalAB[b];
      internalAB[b] = tmp;
    },
  });
  connect(b, {
    swap({ keySwap }) {
      const aSize = aReader.size;
      const a = keySwap[0] + aSize;
      const b = keySwap[1] + aSize;

      let tmp = internalAB[a];
      internalAB[a] = internalAB[b];
      internalAB[b] = tmp;
    },
  });
  return internalAB;
});

const foo = derivedPromise(async (read, resolve) => {
  resolve(await getData(read(id)));

  return () => {
    // Cleanup
    // Con: When in async fn cleanup can only run after promise is complete, not when the sources change
  };
});

const bar = derivedPromise(async (read, addDisposers) => {
  addDisposers(() => {
    // Cleanup
    // Pro: Could run when sources change and/or after promise is complete
  });
  return getData(read(id));
});

const baz = derivedPromise(async (read) => {
  try {
    return getData(read(id));
  } finally {
    // Cleanup
    // Con: cleanup can only run after promise is complete, not when the sources change
  }
});

const fun = derivedPromise(async (read, registerCleanup) => {
  registerCleanup(() => {
    // Cleanup
    // Pro: Could run when sources change and/or after promise is complete
  });
  return getData(read(id));
});

const pA = derivedPromise(async (read) => {
  return getData(read(idA));
});

const pB = derivedPromise(async (read) => {
  return getData(read(idB));
});

/**
 * Pros:
 * - Potential to inspect inFlight status to show spinner, etc.
 * - If used directly in JSX, could inform suspense boundary of status and show loading indicator for whole section
 * - No stale results
 * Cons:
 * - Overhead
 * -
 */
const pC = derivedPromise(async (read) => {
  const [a, b] = await Promise.all([read(pA), read(pB)]);
  return a + b;
});

/**
 * Pros:
 * - Less overhead
 * - c is ready to use synchronously
 * Cons:
 * - stale result potentially shows longer, and could have mismatch with peer data.
 *   Ex: User page w multiple async values derived from id, when id changes user bio might mismatch with posts (stale from previous id)
 * - Can't inspect inFlight status to show spinner, etc.
 */
const [awaitedA, awaitedB] = await Promise.all([pA, pB]);
const c = derived((read) => read(awaitedA) + read(awaitedB));
