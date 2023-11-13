import { bench, run } from 'mitata';

const instanceCount = 100_000;
const callMainCount = 100;
const callInnerCount = 0;

function xyFnControl(x, y) {
  return y % x === 0;
}

bench('control', () => {
  let i = instanceCount;
  while (i--) {
    const x = 3;
    const fn = () => i % 2 === 0;
    let j = callMainCount;
    while (j--) {
      fn();
    }
    j = callInnerCount;
    while (j--) {
      xyFnControl(3, j);
    }
  }
});

// bench('control lazy', () => {
//   let i = instanceCount;
//   while (i--) {
//     const fn = () => i % 2 === 0;
//     const otherFn = () => i % 2 !== 0;
//     let j = callMainCount;
//     while (j--) {
//       fn();
//     }
//     j = callInnerCount;
//     while (j--) {
//       otherFn();
//     }
//   }
// });

const xKey = Symbol();

function xyFnSymbol(y) {
  return y % this[xKey] === 0;
}

bench('symbol', () => {
  let i = instanceCount;
  while (i--) {
    const fn = () => i % 2 === 0;
    fn[xKey] = 3;
    fn.xyFn = xyFnSymbol;
    let j = callMainCount;
    while (j--) {
      fn();
    }
    j = callInnerCount;
    while (j--) {
      fn.xyFn(j);
    }
  }
});

function xyFnProp(y) {
  return y % this.__x === 0;
}

bench('prop', () => {
  let i = instanceCount;
  while (i--) {
    const fn = () => i % 2 === 0;
    fn.__x = 3;
    fn.xyFn = xyFnProp;
    let j = callMainCount;
    while (j--) {
      fn();
    }
    j = callInnerCount;
    while (j--) {
      fn.xyFn(j);
    }
  }
});

class StamperA extends class {
  // A base class whose constructor returns the object it's given
  constructor(obj) {
    return obj;
  }
} {
  #x;
  static setXStamperA(o, x) {
    o.#x = x;
  }
  static xyFnStamperA(o, y) {
    return y % o.#x === 0;
  }
}

const { setXStamperA, xyFnStamperA } = StamperA;

bench('stamp A', () => {
  let i = instanceCount;
  while (i--) {
    const fn = () => i % 2 === 0;
    new StamperA(fn);
    setXStamperA(fn, 3);
    let j = callMainCount;
    while (j--) {
      fn();
    }
    j = callInnerCount;
    while (j--) {
      xyFnStamperA(fn, j);
    }
  }
});

class StamperB extends class {
  // A base class whose constructor returns the object it's given
  constructor(obj) {
    return obj;
  }
} {
  #x;
  static setXStamperB(o, x) {
    o.#x = x;
  }
  static xyFnStamperB(y) {
    return y % this.#x === 0;
  }
}

const { setXStamperB, xyFnStamperB } = StamperB;

bench('stamp B', () => {
  let i = instanceCount;
  while (i--) {
    const fn = () => i % 2 === 0;
    new StamperB(fn);
    setXStamperB(fn, 3);
    fn.xyFn = xyFnStamperB;
    let j = callMainCount;
    while (j--) {
      fn();
    }
    j = callInnerCount;
    while (j--) {
      fn.xyFn(j);
    }
  }
});

await run();
