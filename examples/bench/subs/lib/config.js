// import _assert from 'node:assert';
function _assert(bool) {
  if (!bool) {
    throw new Error('Failed!');
  }
}

export const assert = _assert;

export const runCounter = { voidRuns: 0, oneTypeRuns: 0, manyTypeRuns: 0 };

export const subCount = 1;

export const emitterCount = 1;

export const benchRunCount = 100_000;

export function handleOneTypeMsgData(data) {
  assert(typeof data === 'object');
}

export function handleManyTypeMsgDataA(data) {
  runCounter.manyTypeRuns++;
  assert(data % 3 === 0);
}

export function handleManyTypeMsgDataB({ a, b, c }) {
  runCounter.manyTypeRuns++;
  assert(a % 4 === 0);
  assert(typeof b === 'string');
  assert(typeof c === 'object');
}

export function handleManyTypeMsgDataC({ a, b, d, e }) {
  runCounter.manyTypeRuns++;
  assert(a % 4 === 0);
  assert(typeof b === 'string');
  assert(typeof d === 'number');
  assert(Array.isArray(e));
}

export function handleManyTypeMsgDataD({ f }) {
  runCounter.manyTypeRuns++;
  assert(typeof f === 'string');
}
