import { bench, run } from 'mitata';
// This is a benchmark of the performance impact of using private properties.

const nCount = 10000;
const iCount = 1000;

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
    let n = nCount;
    while (n-- > 0) {
      foo.state += foo.inc;
    }
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
    const foo = new FooC();
    let n = nCount;
    while (n-- > 0) {
      foo.state += foo.inc;
    }
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
    let n = nCount;
    while (n-- > 0) {
      foo.state += foo.inc;
    }
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

bench('ConventionalPrivates (__proto__ last prop)', () => {
  let i = iCount;
  while (i-- > 0) {
    const foo = {
      _state: 1,
      _inc: 13,
      __proto__: FooProto,
    };

    let n = nCount;
    while (n-- > 0) {
      foo.state += foo.inc;
    }
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
    foo._state = 1;
    foo._inc = 13;

    let n = nCount;
    while (n-- > 0) {
      foo.state += foo.inc;
    }
  }
});

const FooProtoC = {
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

bench('ConventionalPrivates (__proto__ first prop)', () => {
  let i = iCount;
  while (i-- > 0) {
    const foo = {
      __proto__: FooProtoC,
      _state: 1,
      _inc: 13,
    };

    let n = nCount;
    while (n-- > 0) {
      foo.state += foo.inc;
    }
  }
});

bench('ConventionalPrivates (Local get/set)', () => {
  let i = iCount;
  while (i-- > 0) {
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
    };

    let n = nCount;
    while (n-- > 0) {
      foo.state += foo.inc;
    }
  }
});

await run();
