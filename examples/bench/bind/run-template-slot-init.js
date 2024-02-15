import { bench, run } from 'mitata';

const count = 5_000_000;

bench('baseline', () => {
  let i = count;
  function foo(a, b, c) {
    return a * b + c;
  }
  function bar(a, b, c, d) {
    return (a * b + c) * d;
  }
  function flip(v) {
    return -v;
  }
  const flipped = flip(2);
  while (i--) {
    if (i % 2) {
      foo(flipped, 3, i);
    } else {
      bar(flipped, 3, -i, i);
    }
  }
});

// Best
bench('bind', () => {
  let i = count;
  function foo(a, b, c) {
    return a * b + c;
  }
  function bar(a, b, c, d) {
    return (a * b + c) * d;
  }
  function flip(v) {
    return -v;
  }
  const fooFn = foo.bind(undefined, flip(2), 3);
  const barFn = bar.bind(undefined, flip(2), 3);
  while (i--) {
    if (i % 2) {
      fooFn(i);
    } else {
      barFn(-i, i);
    }
  }
});

bench('manual wrap', () => {
  let i = count;
  function foo(a, b, c) {
    return a * b + c;
  }
  function bar(a, b, c, d) {
    return (a * b + c) * d;
  }
  function flip(v) {
    return -v;
  }
  const _a = flip(2);
  const fooFn = (c) => foo(_a, 3, c);
  const barFn = (c, d) => foo(_a, 3, c, d);
  while (i--) {
    if (i % 2) {
      fooFn(i);
    } else {
      barFn(-i, i);
    }
  }
});

bench('manual wrap alt', () => {
  let i = count;
  function foo(a, b, c) {
    return a * b + c;
  }
  function bar(a, b, c, d) {
    return (a * b + c) * d;
  }
  function flip(v) {
    return -v;
  }
  const fooFn = (
    (a, b) => (c) =>
      foo(a, b, c)
  )(flip(2), 3);
  const barFn = (
    (a, b) => (c, d) =>
      bar(a, b, c, d)
  )(flip(2), 3);
  while (i--) {
    if (i % 2) {
      fooFn(i);
    } else {
      barFn(-i, i);
    }
  }
});

bench('rigid fn wrap', () => {
  let i = count;
  function foo(a, b, c) {
    return a * b + c;
  }
  function bar(a, b, c, d) {
    return (a * b + c) * d;
  }
  function flip(v) {
    return -v;
  }
  const wrapFoo = (a, b) => (c) => foo(a, b, c);
  const wrapBar = (a, b) => (c, d) => bar(a, b, c, d);
  const fooFn = wrapFoo(flip(2), 3);
  const barFn = wrapBar(flip(2), 3);
  while (i--) {
    if (i % 2) {
      fooFn(i);
    } else {
      barFn(-i, i);
    }
  }
});

bench('curry', () => {
  let i = count;
  function foo(a, b) {
    return (c) => a * b + c;
  }
  function bar(a, b) {
    return (c, d) => (a * b + c) * d;
  }
  function flip(v) {
    return -v;
  }
  const fooFn = foo(flip(2), 3);
  const barFn = bar(flip(2), 3);
  while (i--) {
    if (i % 2) {
      fooFn(i);
    } else {
      barFn(-i, i);
    }
  }
});

bench('curry always', () => {
  let i = count;
  function foo(a, b) {
    return (c) => a * b + c;
  }
  function bar(a, b) {
    return (c, d) => (a * b + c) * d;
  }
  function flip(v) {
    return -v;
  }
  const flipped = flip(2);
  while (i--) {
    if (i % 2) {
      foo(flipped, 3)(i);
    } else {
      bar(flipped, 3)(-i, i);
    }
  }
});

bench('dynamic fn wrap', () => {
  let i = count;
  function foo(a, b, c) {
    return a * b + c;
  }
  function bar(a, b, c, d) {
    return (a * b + c) * d;
  }
  function flip(v) {
    return -v;
  }
  // function wrap(f, a, b) {
  //   return (...args) => f(a, b, ...args);
  // }
  const wrap =
    (f, a, b) =>
    (...args) =>
      f(a, b, ...args);
  const fooFn = wrap(foo, flip(2), 3);
  const barFn = wrap(bar, flip(2), 3);
  while (i--) {
    if (i % 2) {
      fooFn(i);
    } else {
      barFn(-i, i);
    }
  }
});

await run();
