import { bench, run } from 'mitata';

const runCount = 10_000_000;

bench('poly separate nullable obj and bool', () => {
  let i = runCount;
  const p = { v: 3 };
  const fn = (z, a, b, c, d, e) =>
    z + (a + b) * c.v - (d === true ? 2 : e === null ? 1 : e.v);
  while (--i) {
    const d = i % 5 !== 0;
    const e = d ? null : i % 2 ? null : { v: 10 };
    fn(5, 1, 2, p, true, e);
  }
});

bench('poly combined nullable obj', () => {
  let i = runCount;
  const p = { v: 3 };
  const fn = (z, a, b, c, de) =>
    z + (a + b) * c.v - (de === c ? 2 : de === null ? 1 : de.v);
  while (--i) {
    const d = i % 5 !== 0;
    const de = d ? p : i % 2 ? null : { v: 10 };
    fn(5, 1, 2, p, de);
  }
});

bench('poly combined obj and const objs', () => {
  let i = runCount;
  const x = { v: -1 };
  const p = { v: 3 };
  const fn = (z, a, b, c, de) =>
    z + (a + b) * c.v - (de === c ? 2 : de === x ? 1 : de.v);
  while (--i) {
    const d = i % 5 !== 0;
    const de = d ? p : i % 2 ? x : { v: 10 };
    fn(5, 1, 2, p, de);
  }
});

bench('poly combined obj and bool', () => {
  let i = runCount;
  const p = { v: 3 };
  const fn = (z, a, b, c, de) =>
    z + (a + b) * c.v - (de === true ? 2 : de === false ? 1 : de.v);
  while (--i) {
    const d = i % 5 !== 0;
    const de = d ? true : i % 2 ? false : { v: 10 };
    fn(5, 1, 2, p, de);
  }
});

bench('poly combined obj and num', () => {
  let i = runCount;
  const p = { v: 3 };
  const fn = (z, a, b, c, de) =>
    z + (a + b) * c.v - (de === 1 ? 2 : de === 0 ? 1 : de.v);
  while (--i) {
    const d = i % 5 !== 0;
    const de = d ? 1 : i % 2 ? 0 : { v: 10 };
    fn(5, 1, 2, p, de);
  }
});

run();
