import { mixedValues, runCount, shouldRunNoCtx, values } from './setup.js';

function read(val) {
  this.recordSource(val);
  return val.unwrap();
}

function createReader(ctx) {
  return read.bind(ctx);
}

function safeRead(read, val) {
  if (val.unwrap === undefined) {
    return val;
  }
  return read(val);
}

for (let i = 0; i < runCount; i++) {
  const reader = createReader({ recordSource() {} });
  for (const value of values) {
    reader(value);
  }
  for (const value of mixedValues) {
    safeRead(reader, value);
  }
  if (shouldRunNoCtx) {
    for (const value of values) {
      value.unwrap();
    }
  }
}
