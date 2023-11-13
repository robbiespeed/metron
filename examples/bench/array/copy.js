import { bench, run } from 'mitata';

const count = 10_000;

const arr = new Array(10_000).fill(0).map(Math.random);

bench('slice', () => {
  // const arr = new Array(10_000).fill(0).map(Math.random);
  let i = count;
  while (i--) {
    const copied = arr.slice();
  }
});

bench('from', () => {
  // const arr = new Array(10_000).fill(0).map(Math.random);
  let i = count;
  while (i--) {
    const copied = Array.from(arr);
  }
});

bench('spread', () => {
  // const arr = new Array(10_000).fill(0).map(Math.random);
  let i = count;
  while (i--) {
    const copied = [...arr];
  }
});

await run();
