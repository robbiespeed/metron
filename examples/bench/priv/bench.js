import { bench, run } from 'mitata';
// This is a benchmark of the performance impact of using private properties.

const nCount = 1000000;
const iCount = 100;

class FooN {
  #state = 1;
  #inc = 13;

  run() {
    let n = nCount;
    while (n-- > 0) {
      this.#state += this.#inc;
    }
    return n;
  }
}

bench('NativePrivates', () => {
  let i = iCount;
  while (i-- > 0) {
    new FooN().run();
  }
});

class FooC {
  _state = 1;
  _inc = 13;

  run() {
    let n = nCount;
    while (n-- > 0) {
      this._state += this._inc;
    }
    return n;
  }
}

bench('ConventionalPrivates', () => {
  let i = iCount;
  while (i-- > 0) {
    new FooC().run();
  }
});

const FooNCProto = {
  run() {
    let n = nCount;
    while (n-- > 0) {
      this._state += this._inc;
    }
    return n;
  },
};

bench('ConventionalPrivates (__proto__)', () => {
  let i = iCount;
  while (i-- > 0) {
    const foo = {
      _state: 1,
      _inc: 13,
      __proto__: FooNCProto,
    };

    foo.run();
  }
});

await run();
