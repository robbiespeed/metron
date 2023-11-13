import { bench, run } from 'mitata';
// This is a benchmark of the performance impact of using private properties.

const nCount = 1000;
const iCount = 1000;

function runLoop(foo, dynamicKey) {
  let n = nCount;
  while (n-- > 0) {
    foo.state += foo.inc;
    foo[dynamicKey] = foo[dynamicKey] + 1;
  }
  return n;
}

function defineGetSet(object, key, getter, setter) {
  Object.defineProperty(object, key, {
    get: getter,
    set: setter,
    // To most closely match declared getter/setters
    configurable: true,
  });
}

class FooN {
  #state = 1;
  #inc = 13;

  get state() {
    return this.#state;
  }
  set state(v) {
    this.#state = v;
  }
  get inc() {
    return this.#inc;
  }
  set inc(v) {
    this.#inc = v;
  }
}

bench('NativePrivates', () => {
  let i = iCount;
  while (i-- > 0) {
    const foo = new FooN();
    const dynamicKey = `k${i}`;
    let dyn = 0;
    defineGetSet(
      foo,
      dynamicKey,
      () => dyn,
      (v) => {
        dyn = v;
      }
    );

    runLoop(foo, dynamicKey);
  }
});

class FooC {
  _state = 1;
  _inc = 13;

  get state() {
    return this._state;
  }
  set state(v) {
    this._state = v;
  }
  get inc() {
    return this._inc;
  }
  set inc(v) {
    this._inc = v;
  }
}

bench('ConventionalPrivates', () => {
  let i = iCount;
  while (i-- > 0) {
    const foo = new FooCNF();
    const dynamicKey = `k${i}`;
    let dyn = 0;
    defineGetSet(
      foo,
      dynamicKey,
      () => dyn,
      (v) => {
        dyn = v;
      }
    );

    runLoop(foo, dynamicKey);
  }
});

class FooCNF {
  constructor() {
    this._state = 1;
    this._inc = 13;
  }

  get state() {
    return this._state;
  }
  set state(v) {
    this._state = v;
  }
  get inc() {
    return this._inc;
  }
  set inc(v) {
    this._inc = v;
  }
}

bench('ConventionalPrivates (No fields)', () => {
  let i = iCount;
  while (i-- > 0) {
    const foo = new FooCNF();
    const dynamicKey = `k${i}`;
    let dyn = 0;
    defineGetSet(
      foo,
      dynamicKey,
      () => dyn,
      (v) => {
        dyn = v;
      }
    );

    runLoop(foo, dynamicKey);
  }
});

const FooProto = {
  get state() {
    return this._state;
  },
  set state(v) {
    this._state = v;
  },
  get inc() {
    return this._inc;
  },
  set inc(v) {
    this._inc = v;
  },
};

bench('ConventionalPrivates (__proto__)', () => {
  let i = iCount;
  while (i-- > 0) {
    const dynamicKey = `k${i}`;
    let dyn = 0;
    const foo = {
      _state: 1,
      _inc: 13,
      get [dynamicKey]() {
        return dyn;
      },
      set [dynamicKey](v) {
        dyn = v;
      },
      __proto__: FooProto,
    };

    runLoop(foo, dynamicKey);
  }
});

const FooProtoB = {
  get state() {
    return this._state;
  },
  set state(v) {
    this._state = v;
  },
  get inc() {
    return this._inc;
  },
  set inc(v) {
    this._inc = v;
  },
};

bench('ConventionalPrivates (Object.create)', () => {
  let i = iCount;
  while (i-- > 0) {
    const foo = Object.create(FooProtoB);
    const dynamicKey = `k${i}`;
    let dyn = 0;
    defineGetSet(
      foo,
      dynamicKey,
      () => dyn,
      (v) => {
        dyn = v;
      }
    );

    runLoop(foo, dynamicKey);
  }
});

bench('ConventionalPrivates (Local get/set)', () => {
  let i = iCount;
  while (i-- > 0) {
    const dynamicKey = `k${i}`;
    let dyn = 0;
    const foo = {
      _state: 1,
      _inc: 13,
      get state() {
        return this._state;
      },
      set state(v) {
        this._state = v;
      },
      get inc() {
        return this._inc;
      },
      set inc(v) {
        this._inc = v;
      },
      get [dynamicKey]() {
        return dyn;
      },
      set [dynamicKey](v) {
        dyn = v;
      },
    };

    runLoop(foo, dynamicKey);
  }
});

await run();
