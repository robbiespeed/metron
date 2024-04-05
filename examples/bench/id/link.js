import { randomUUID } from 'node:crypto';
import { bench, run } from 'mitata';

const runCount = 10_00_000;

const incNumIds = [];
let nextN_INI = 2 ** 30 - runCount / 2;
let i = runCount;
while (i--) {
  incNumIds.push(nextN_INI++);
}

bench('incremental num', () => {
  const ids = new Map();
  let i = runCount;
  while (i--) {
    ids.set(incNumIds[i], { i });
  }
});

const incNumIdsB = [];
let nextN_INIB = 2 ** 30 - runCount / 2;
i = runCount;
while (i--) {
  incNumIdsB.push(nextN_INIB++);
}

bench('incremental num (around 2 ** 30) on array', () => {
  const ids = [];
  let i = runCount;
  while (i--) {
    ids[incNumIdsB[i]] = { i };
  }
});

const incStringIds = [];
let nextN_ISI = 0;
i = runCount;
while (i--) {
  incStringIds.push(`${nextN_ISI++}`);
}

bench('incremental num as string', () => {
  const ids = new Map();
  let i = runCount;
  while (i--) {
    ids.set(incStringIds[i], { i });
  }
});

const incStringIdsB = [];
let nextN_ISIB = 2 ** 30 - runCount / 2;
i = runCount;
while (i--) {
  incStringIdsB.push(`${nextN_ISIB++}`);
}

bench('incremental num as string on obj', () => {
  const ids = Object.create(null);
  let i = runCount;
  while (i--) {
    ids[incStringIdsB[i]] = { i };
  }
});

const bigIntIds = [];
let nextN_BII = 0n;
i = runCount;
while (i--) {
  bigIntIds.push(nextN_BII++);
}

bench('incremental big int', () => {
  const ids = new Map();
  let i = runCount;
  while (i--) {
    ids.set(bigIntIds[i], { i });
  }
});

run();
