import { bench, run } from 'mitata';

const count = 500_000;

function foo(a, b, c) {
  return a * b + c;
}

function bar(c) {
  return c * 2;
}

bench('bind', () => {
  let i = count;
  const store = new Array(count);
  while (i--) {
    const b = i + 2;
    store[i] = b % 2 ? foo.bind(undefined, 2, b) : bar;
  }
});

// Best for frequent calls like render functions (Due to runtime perf)
bench('manual wrap', () => {
  let i = count;
  const store = new Array(count);
  while (i--) {
    const b = i + 2;
    store[i] = b % 2 ? (c) => foo(2, b, c) : bar;
  }
});

bench('array', () => {
  let i = count;
  const store = new Array(count);
  while (i--) {
    const b = i + 2;
    store[i] = b % 2 ? [foo, 2, b] : [bar];
  }
});

// Best for non frequent calls like click event handlers (Due to creation perf)
bench('mixed array', () => {
  let i = count;
  const store = new Array(count);
  while (i--) {
    const b = i + 2;
    store[i] = b % 2 ? [foo, 2, b] : bar;
  }
});

await run();
