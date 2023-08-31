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
