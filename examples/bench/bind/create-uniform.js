import { bench, run } from 'mitata';

const count = 100_000;

bench('bind', () => {
  let i = count;
  const store = new Array(count);
  function foo(a, b, c) {
    return a * b + c;
  }
  while (i--) {
    const b = i / 3;
    store[i] = foo.bind(undefined, 2, b);
  }
});

const wrap = (fn, ...args) => {
  return (...rest) => fn(...args, ...rest);
};

bench('universal wrap', () => {
  let i = count;
  const store = new Array(count);
  function foo(a, b, c) {
    return a * b + c;
  }
  while (i--) {
    const b = i / 3;
    store[i] = wrap(foo, 2, b);
  }
});

bench('rigid fn wrap', () => {
  let i = count;
  const store = new Array(count);
  function foo(a, b, c) {
    return a * b + c;
  }
  const wrapFoo = (a, b) => {
    return (c) => foo(a, b, c);
  };
  while (i--) {
    const b = i / 3;
    store[i] = wrapFoo(2, b);
  }
});

bench('manual wrap', () => {
  let i = count;
  const store = new Array(count);
  function foo(a, b, c) {
    return a * b + c;
  }
  while (i--) {
    const b = i / 3;
    store[i] = (c) => foo(2, b, c);
  }
});

bench('array', () => {
  let i = count;
  const store = new Array(count);
  function foo(a, b, c) {
    return a * b + c;
  }
  while (i--) {
    const b = i / 3;
    store[i] = [foo, 2, b];
  }
});

await run();
