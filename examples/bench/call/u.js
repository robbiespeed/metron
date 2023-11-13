import { bench, run } from '../node_modules/mitata/src/cli.mjs';

const aCount = 10000;

bench('Call with data', () => {
  function fnDefault() {
    return true;
  }
  function fn() {
    return this.d === 'foo';
  }
  class Item {
    #d = 'foo';
    #fn = fnDefault;
    constructor(d, fn) {
      this.#d = d;
      this.#fn = fn;
    }
    static run(a) {
      try {
        return a.#fn(this.#d);
      } catch (err) {
        return false;
      }
    }
  }
  const r = Item.run;

  let j = aCount;
  while (j-- > 0) {
    const a = new Item('foo', fn);
    r(a);
  }
});

bench('Call without data', () => {
  function fnDefault() {
    return true;
  }
  function fn() {
    return this.d === 'foo';
  }
  class Item {
    d;
    #fn = fnDefault;
    constructor(d, fn) {
      this.d = d;
      this.#fn = fn;
    }
    static run(a) {
      try {
        return a.#fn();
      } catch (err) {
        return false;
      }
    }
  }
  const r = Item.run;

  let j = aCount;
  while (j-- > 0) {
    const a = new Item('foo', fn);
    r(a);
  }
});

// Winner
bench('Call without data B', () => {
  function fnDefault() {
    return true;
  }
  function fn() {
    return this.d === 'foo';
  }
  class Item {
    d;
    #fn;
    constructor(d, fn) {
      this.d = d;
      this.#fn = fn ?? fnDefault;
    }
    static run(a) {
      try {
        return a.#fn();
      } catch (err) {
        return false;
      }
    }
  }
  const r = Item.run;

  let j = aCount;
  while (j-- > 0) {
    const a = new Item('foo', fn);
    r(a);
  }
});

bench('Call without data C', () => {
  function fnDefault() {
    return true;
  }
  function fn() {
    return this.d === 'foo';
  }
  class Item {
    d;
    #fn = fnDefault;
    setFn(fn) {
      this.#fn = fn;
    }
    static run(a) {
      try {
        return a.#fn();
      } catch (err) {
        return false;
      }
    }
  }
  const r = Item.run;

  let j = aCount;
  while (j-- > 0) {
    const a = new Item();
    a.d = 'foo';
    a.setFn(fn);
    r(a);
  }
});

bench('Call all public', () => {
  function fnDefault() {
    return true;
  }
  function fn() {
    return this.d === 'foo';
  }
  class Item {
    d;
    fn = fnDefault;
    static run(a) {
      try {
        return a.fn();
      } catch (err) {
        return false;
      }
    }
  }
  const r = Item.run;

  let j = aCount;
  while (j-- > 0) {
    const a = new Item();
    a.d = 'foo';
    a.fn = fn;
    r(a);
  }
});

bench('Call all public construct', () => {
  function fnDefault() {
    return true;
  }
  function fn() {
    return this.d === 'foo';
  }
  class Item {
    d;
    fn = fnDefault;
    constructor(d, fn) {
      this.d = d;
      this.fn = fn;
    }
    static run(a) {
      try {
        return a.fn();
      } catch (err) {
        return false;
      }
    }
  }
  const r = Item.run;

  let j = aCount;
  while (j-- > 0) {
    const a = new Item('foo', fn);
    r(a);
  }
});

bench('Explicit call undefined', () => {
  function fnDefault() {
    return true;
  }
  function fn() {
    return this.d === 'foo';
  }
  class Item {
    #d = 'foo';
    #fn = fnDefault;
    constructor(d, fn) {
      this.#d = d;
      this.#fn = fn;
    }
    static run(a) {
      try {
        return a.#fn.call(undefined, this.#d);
      } catch (err) {
        return false;
      }
    }
  }
  const r = Item.run;

  let j = aCount;
  while (j-- > 0) {
    const a = new Item('foo', fn);
    r(a);
  }
});

run();
