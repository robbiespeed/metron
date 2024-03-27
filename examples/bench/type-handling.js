import { bench, run } from 'mitata';

const runCount = 10_00_000;

// Test to see what the impact of handling conditional flow on typed objects (jsx nodes, slots)

bench('handler', () => {
  let i = runCount;

  const nodeType = Symbol();

  function handleNode(value) {
    const type = value[nodeType];
    if (type !== undefined) {
      const handleFn = handler[type];
      if (handleFn !== undefined) {
        handleFn(value);
        return true;
      }
    }

    return false;
  }

  let r = 0;

  const handler = {
    [0]: () => (r += 0),
    [1]: () => (r += 1),
    [2]: () => (r += 2),
  };

  while (--i) {
    const nT = i % 4;
    const v = nT !== 3 ? { [nodeType]: nT } : nT;
    if (handleNode(v)) {
      continue;
    }
    r -= 1;
  }
});

bench('isNode switch', () => {
  let i = runCount;

  const nodeType = Symbol();

  function isNode(value) {
    return value[nodeType] !== undefined;
  }

  let r = 0;

  while (--i) {
    const nT = i % 4;
    const v = nT !== 3 ? { [nodeType]: nT } : nT;
    if (isNode(v)) {
      switch (v[nodeType]) {
        case 0:
          r += 0;
          break;
        case 1:
          r += 1;
          break;
        case 2:
          r += 2;
          break;
      }
      continue;
    }
    r -= 1;
  }
});

bench('isNode if', () => {
  let i = runCount;

  const nodeType = Symbol();

  function isNode(value) {
    return value[nodeType] !== undefined;
  }

  let r = 0;

  while (--i) {
    const nT = i % 4;
    const v = nT !== 3 ? { [nodeType]: nT } : nT;
    if (isNode(v)) {
      const _nt = v[nodeType];
      if (_nt === 0) {
        r += 0;
      } else if (_nt === 1) {
        r += 1;
      } else if (_nt === 2) {
        r += 2;
      }
      continue;
    }
    r -= 1;
  }
});

bench('raw if', () => {
  let i = runCount;

  const nodeType = Symbol();

  let r = 0;

  while (--i) {
    const nT = i % 4;
    const v = nT !== 3 ? { [nodeType]: nT } : nT;
    const _nt = v[nodeType];
    if (_nt !== undefined) {
      if (_nt === 0) {
        r += 0;
      } else if (_nt === 1) {
        r += 1;
      } else if (_nt === 2) {
        r += 2;
      }
      continue;
    }
    r -= 1;
  }
});

run();
