import { bench, run } from 'mitata';

const count = 1_000_000;

bench('control', () => {
  let i = count;
  while (i--) {
    const fn = () => true;
  }
});

const key = Symbol();

bench('symbol', () => {
  let i = count;
  while (i--) {
    const fn = () => true;
    fn[key] = true;
    key in fn;
  }
});

bench('prop', () => {
  let i = count;
  while (i--) {
    const fn = () => true;
    fn.__ = true;
    '__' in fn;
  }
});

class Stamper extends class {
  // A base class whose constructor returns the object it's given
  constructor(obj) {
    return obj;
  }
} {
  #isB = true;
  static isStamped(o) {
    return #isB in o;
  }
}

const isStamped = Stamper.isStamped;

bench('stamp', () => {
  let i = count;
  while (i--) {
    const fn = () => true;
    new Stamper(fn);
    isStamped(fn);
  }
});

const { defineProperty } = Object;

bench('defineProperty', () => {
  let i = count;
  while (i--) {
    const fn = () => true;
    Object.defineProperty(fn, '__', {
      // configurable: true,
      // enumerable: true,
      // writable: true,
      value: true,
    });
    '__' in fn;
  }
});

await run();
