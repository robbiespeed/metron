import { bench, run } from 'mitata';

const count = 500_000;

const wrap = (fn, ...args) => {
  return (...rest) => fn(...args, ...rest);
};

bench('universal wrap', () => {
  let i = count;
  function foo(a, b, c) {
    return a * b + c;
  }
  const fn = wrap(foo, 2, 3);
  while (i--) {
    fn(i);
  }
});

bench('bind', () => {
  let i = count;
  function foo(a, b, c) {
    return a * b + c;
  }
  const fn = foo.bind(undefined, 2, 3);
  while (i--) {
    fn(i);
  }
});

bench('rigid fn wrap', () => {
  let i = count;
  function foo(a, b, c) {
    return a * b + c;
  }
  const wrapFoo = (a, b) => {
    return (c) => foo(a, b, c);
  };
  const fn = wrapFoo(2, 3);
  while (i--) {
    fn(i);
  }
});

// Best for frequent calls like render functions (Due to runtime perf)
bench('manual wrap', () => {
  let i = count;
  function foo(a, b, c) {
    return a * b + c;
  }
  const fn = (c) => foo(2, 3, c);
  while (i--) {
    fn(i);
  }
});

// Best for non frequent calls like click event handlers (Due to creation perf)
// Though still not as good as just attaching the extra data needed to the element
bench('array', () => {
  let i = count;
  function foo(a, b, c) {
    return a * b + c;
  }
  const fnInfo = [foo, 2, 3];
  while (i--) {
    const [fn, a, b] = fnInfo;
    fn(a, b, i);
  }
});

await run();
