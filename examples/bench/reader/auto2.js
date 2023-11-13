import {
  autoMixedValues2,
  autoValues2,
  runCount,
  setAutoCtx,
  shouldRunNoCtx,
} from './setup.js';

function safeUnwrap(value) {
  if (value.unwrap === undefined) {
    return value;
  }
  return value.unwrap();
}

for (let i = 0; i < runCount; i++) {
  setAutoCtx({ recordSource() {} });
  for (const value of autoValues2) {
    value.unwrap();
  }
  for (const value of autoMixedValues2) {
    safeUnwrap(value);
  }
  if (shouldRunNoCtx) {
    setAutoCtx(undefined);
    for (const value of autoValues2) {
      value.unwrap();
    }
  }
}
