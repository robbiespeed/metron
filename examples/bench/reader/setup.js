class Wrapped {
  #value;
  constructor(value) {
    this.#value = value;
  }
  unwrap() {
    return this.#value;
  }
}

export const shouldRunNoCtx = false;
export const runCount = 50_000;
const valueCount = 10_000;
const mixedCount = 0;

export const values = new Array(valueCount)
  .fill()
  .map((_, i) => new Wrapped(i));

export const mixedValues = new Array(mixedCount)
  .fill()
  .map((_, i) => (i % 2 ? new Wrapped(i) : i));

let autoCtx;

export function setAutoCtx(ctx) {
  autoCtx = ctx;
}

class Auto {
  #value;
  constructor(value) {
    this.#value = value;
  }
  unwrap() {
    autoCtx?.recordSource(this);
    return this.#value;
  }
}

export const autoValues = new Array(valueCount)
  .fill()
  .map((_, i) => new Auto(i));

export const autoMixedValues = new Array(mixedCount)
  .fill()
  .map((_, i) => (i % 2 ? new Auto(i) : i));

function createAuto(value) {
  const wrapped = new Wrapped(value);
  return {
    unwrap: () => {
      autoCtx?.recordSource(this);
      return wrapped.unwrap();
    },
  };
}

export const autoValues2 = new Array(valueCount)
  .fill()
  .map((_, i) => createAuto(i));

export const autoMixedValues2 = new Array(mixedCount)
  .fill()
  .map((_, i) => (i % 2 ? createAuto(i) : i));
