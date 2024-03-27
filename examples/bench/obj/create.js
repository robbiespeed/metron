import { bench, run } from 'mitata';

const iCount = 10_000;

bench('Spread create, small', () => {
  let i = iCount;
  const base = { a: 1, b: 2, c: 3 };
  while (i-- > 0) {
    const o = { ...base };
  }
});

bench('Entries create, small', () => {
  let i = iCount;
  const base = [
    ['a', 1],
    ['b', 2],
    ['c', 3],
  ];
  while (i-- > 0) {
    const o = Object.fromEntries(base);
  }
});

bench('Entries create, small', () => {
  let i = iCount;
  const base = [
    ['a', 1],
    ['b', 2],
    ['c', 3],
  ];
  while (i-- > 0) {
    const o = {};
    for (let j = 0; j < base.length; j++) {
      const [key, value] = base[j];
      o[key] = value;
    }
  }
});

bench('Entries create, small alt', () => {
  let i = iCount;
  const baseKeys = ['a', 'b', 'c'];
  const baseValues = [1, 2, 3];
  while (i-- > 0) {
    const o = {};
    for (let j = 0; j < baseKeys.length; j++) {
      o[baseKeys[j]] = baseValues[j];
    }
  }
});

await run();
