import {
  autoMixedValues,
  autoValues,
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
  for (const value of autoValues) {
    value.unwrap();
  }
  for (const value of autoMixedValues) {
    safeUnwrap(value);
  }
  if (shouldRunNoCtx) {
    setAutoCtx(undefined);
    for (const value of autoValues) {
      value.unwrap();
    }
  }
}
