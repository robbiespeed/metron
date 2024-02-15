import { bench, run } from 'mitata';

const count = 100_000;

const size = 1_000;

bench('fill string', () => {
  let c = count;
  while (c--) {
    const arr = new Array(size).fill('').map((_, i) => i + i);
  }
});

bench('fill undefined', () => {
  let c = count;
  while (c--) {
    const arr = new Array(size).fill(undefined).map((_, i) => i + i);
  }
});

bench('loop w length', () => {
  let c = count;
  while (c--) {
    const arr = new Array(size);
    for (let i = 0; i < size; i++) {
      arr[i] = i + i;
    }
  }
});

// bench('loop', () => {
//   let c = count;
//   while (c--) {
//     const arr = [];
//     for (let i = 0; i < size; i++) {
//       arr[i] = i + i;
//     }
//   }
// });

// bench('loop w length after init', () => {
//   let c = count;
//   while (c--) {
//     const arr = [];
//     arr.length = size;
//     for (let i = 0; i < size; i++) {
//       arr[i] = i + i;
//     }
//   }
// });

await run();
