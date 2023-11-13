import { mixedValues, runCount, shouldRunNoCtx, values } from './setup.js';

function createReader(ctx) {
  const reader = (val) => {
    ctx.recordSource(val);
    return val.unwrap();
  };
  reader.any = (val) => {
    if (val.unwrap === undefined) {
      return val;
    }
    return reader(val);
  };
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
