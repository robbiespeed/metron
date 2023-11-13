import { bench, run } from '../node_modules/mitata/src/cli.mjs';

const aCount = 1000;
const bCount = 100;

bench('# Baseline', () => {
  class Item {
    #n = 0;
    v = 'foo';
    static aFn(a) {
      a.#n++;
    }
  }
  const aFn = Item.aFn;

  function fn(a, b, c) {
    if (c) {
      aFn(a);
    }
    return b.v;
  }

  let j = aCount;
  while (j-- > 0) {
    const a = new Item();
    let i = bCount;
    while (i-- > 0) {
      const b = new Item();
      const v = fn(a, b, i % 2 === 0);
    }
  }
});

bench('# Wrap', () => {
  class Item {
    #n = 0;
    v = 'foo';
    static aFn(a) {
      a.#n++;
    }
  }
  const aFn = Item.aFn;

  let j = aCount;
  while (j-- > 0) {
    const a = new Item();
    let r = true;
    const f = (b) => (r && aFn(a), b.v);
    let i = bCount;
    while (i-- > 0) {
      r = i % 2 === 0;
      const b = new Item();
      const v = f(b);
    }
  }
});

bench('# Bind', () => {
  class Item {
    #n = 0;
    v = 'foo';
    static aFn(a) {
      a.#n++;
    }
  }
  const aFn = Item.aFn;

  function fn(a, b) {
    return this.r && aFn(a), b.v;
  }

  let j = aCount;
  while (j-- > 0) {
    const a = new Item();
    const r = { r: true };
    const f = fn.bind(r, a);
    let i = bCount;
    while (i-- > 0) {
      r.r = i % 2 === 0;
      const b = new Item();
      const v = f(b);
    }
  }
});

bench('# Method', () => {
  class Item {
    #n = 0;
    v = 'foo';
    aFn() {
      this.#n++;
    }
  }
  class Wrapper {
    a;
    aFn() {
      this.a?.aFn();
    }
  }

  function fn(b) {
    this.aFn();
    return b.v;
  }

  let j = aCount;
  while (j-- > 0) {
    const a = new Item();
    const w = new Wrapper();
    w.a = a;
    const f = fn.bind(w);
    let i = bCount;
    while (i-- > 0) {
      w.a = i % 2 === 0 ? a : undefined;
      const b = new Item();
      const v = f(b);
    }
  }
});

run();
