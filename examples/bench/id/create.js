import { randomUUID } from 'node:crypto';
import { bench, run } from 'mitata';

const runCount = 10_00_000;

bench('incremental num', () => {
  const ids = [];
  let nextN = 0;

  let i = runCount;
  while (i--) {
    ids.push(nextN++);
  }
});

bench('incremental num w check', () => {
  const ids = [];
  const maxN = Number.MAX_SAFE_INTEGER;
  let nextN = 0;

  let i = runCount;
  while (i--) {
    if (nextN === maxN) {
      throw new Error('Max ids exceeded');
    }
    ids.push(nextN++);
  }
});

bench('incremental num w check (near end)', () => {
  const ids = [];
  const maxN = Number.MAX_SAFE_INTEGER;
  let nextN = Number.MAX_SAFE_INTEGER - runCount * 2;

  let i = runCount;
  while (i--) {
    if (nextN === maxN) {
      throw new Error('Max ids exceeded');
    }
    ids.push(nextN++);
  }
});

bench('incremental num w check (around 2 ** 30)', () => {
  const ids = [];
  const maxN = Number.MAX_SAFE_INTEGER;
  let nextN = 2 ** 30 - runCount / 2;

  let i = runCount;
  while (i--) {
    if (nextN === maxN) {
      throw new Error('Max ids exceeded');
    }
    ids.push(nextN++);
  }
});

bench('incremental num as string', () => {
  const ids = [];
  let nextN = 0;

  let i = runCount;
  while (i--) {
    ids.push(`n:${nextN++}`);
  }
});

bench('incremental num as string w check', () => {
  const ids = [];
  const maxN = Number.MAX_SAFE_INTEGER;
  let nextN = 0;

  let i = runCount;
  while (i--) {
    if (nextN === maxN) {
      throw new Error('Max ids exceeded');
    }
    ids.push(`n:${nextN++}`);
  }
});

bench('incremental big int', () => {
  const ids = [];
  let nextN = 0n;

  let i = runCount;
  while (i--) {
    ids.push(nextN++);
  }
});

bench('incremental big int as string', () => {
  const ids = [];
  let nextN = 0n;

  let i = runCount;
  while (i--) {
    ids.push(`n:${nextN++}`);
  }
});

bench('crypto uuid', () => {
  const ids = [];

  let i = runCount;
  while (i--) {
    ids.push(randomUUID());
  }
});

run();
