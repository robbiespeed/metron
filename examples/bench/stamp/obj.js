import { bench, run } from 'mitata';

const count = 1_000_000;

const sym = Symbol();

bench('control', () => {
  let i = count;
  while (i--) {
    const o = { [sym]: true };
    sym in o;
  }
});

class A {
  #isA = true;
  static isA(o) {
    return #isA in o;
  }
}

const isA = A.isA;

bench('class', () => {
  let i = count;
  while (i--) {
    const a = new A();
    isA(a);
  }
});

class B extends class {
  // A base class whose constructor returns the object it's given
  constructor(obj) {
    return obj;
  }
} {
  #isB = true;
  static isB(o) {
    return #isB in o;
  }
}

const isB = B.isB;

bench('stamp', () => {
  let i = count;
  while (i--) {
    const b = {};
    new B(b);
    isB(b);
  }
});

await run();
