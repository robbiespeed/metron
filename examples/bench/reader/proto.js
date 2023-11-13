import { mixedValues, runCount, shouldRunNoCtx, values } from './setup.js';

function read(val) {
  this.recordSource(val);
  return val.unwrap();
}

const ReaderProto = {
  any(val) {
    if (val.unwrap === undefined) {
      return val;
    }
    return this(val);
  },
};

function createReader(ctx) {
  const reader = read.bind(ctx);
  Object.setPrototypeOf(reader, ReaderProto);
  return reader;
}

for (let i = 0; i < runCount; i++) {
  const reader = createReader({ recordSource() {} });
  for (const value of values) {
    reader(value);
  }
  for (const value of mixedValues) {
    reader.any(value);
  }
  if (shouldRunNoCtx) {
    for (const value of values) {
      value.unwrap();
    }
  }
}
