import { bench, run } from 'mitata';

const runCount = 10_00_000;
const createCount = 1000;

// const proto = Object.create(Function.prototype);
// proto.getThingA = function () {
//   return this.things.a();
// };
// Object.seal(proto);

class TFn extends Function {
  getThingA() {
    this.things.a();
  }
}
const proto = TFn.prototype;

bench('create many', () => {
  let i = createCount;
  while (--i) {
    const a = [];
    const f = () => {
      a.push(1);
    };
    f.b = { stuff: [1, 2, 3], things: { a: () => 'a' } };
    // Object.preventExtensions(f);
  }
});

bench('create many no extra', () => {
  let i = createCount;
  while (--i) {
    const a = [];
    const f = () => {
      a.push(1);
    };
  }
});

const wm = new WeakMap();

bench('create many WM extra', () => {
  let i = createCount;
  while (--i) {
    const z = { a: [], stuff: [1, 2, 3], things: { a: () => 'a' } };
    const f = () => {
      z.a.push(1);
    };
    wm.set(f, z);
  }
});

// Good option for template components
bench('create many proto', () => {
  let i = createCount;
  while (--i) {
    const a = [];
    const f = () => {
      a.push(1);
    };
    f.stuff = [1, 2, 3];
    f.things = { a: () => 'a' };
    Object.setPrototypeOf(f, proto);
    // Object.preventExtensions(f);
  }
});

bench('create one proto and run', () => {
  const a = [];
  const f = () => {
    a.push(1);
  };
  f.stuff = [1, 2, 3];
  f.things = { a: () => 'a' };
  Object.setPrototypeOf(f, proto);
  // Object.seal(f);
  let i = runCount;
  while (--i) {
    f();
  }
});

// class Base {
//   static getThingA() {
//     return this.things.a();
//   }
// }

// bench('create many w extend', () => {
//   let i = count;
//   while (--i) {
//     const a = [];
//     class C extends Base {
//       static f = () => {
//         a.push(1);
//       };
//       static stuff = [1, 2, 3];
//       static things = { a: () => 'a' };
//     }
//   }
// });

// bench('create one w extend an run', () => {
//   const a = [];
//   class C extends Base {
//     static f = () => {
//       a.push(1);
//     };
//     static stuff = [1, 2, 3];
//     static things = { a: () => 'a' };
//   }
//   let i = count;
//   while (--i) {
//     C.f();
//   }
// });

class Obj {
  #a = [];
  f = () => {
    this.#a.push(1);
  };
  stuff = [1, 2, 3];
  things = { a: () => 'a' };
  getThingA() {
    return this.things.a();
  }
}

bench('create many obj', () => {
  let i = createCount;
  while (--i) {
    const o = new Obj();
  }
});

bench('create one obj an run', () => {
  const o = new Obj();
  let i = runCount;
  while (--i) {
    o.f();
  }
});

bench('create many pojo', () => {
  let i = createCount;
  while (--i) {
    const a = [];
    const o = {
      f: () => {
        a.push(1);
      },
      stuff: [1, 2, 3],
      things: { a: () => 'a' },
      getThingA() {
        return this.things.a();
      },
    };
  }
});

bench('create one pojo an run', () => {
  const a = [];
  const o = {
    f: () => {
      a.push(1);
    },
    stuff: [1, 2, 3],
    things: { a: () => 'a' },
    getThingA() {
      return this.things.a();
    },
  };
  let i = runCount;
  while (--i) {
    o.f();
  }
});

run();
