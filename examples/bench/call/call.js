import { bench, run } from '../node_modules/mitata/src/cli.mjs';

const aCount = 1000;
const bCount = 100;

bench('Baseline', () => {
  class Item {
    n = 0;
    v = 'foo';
    // static fn(a, b) {
    //   a.n++;
    //   return b.v;
    // }
  }
  // const fn = Item.fn;
  function fn(a, b) {
    a.n++;
    return b.v;
  }

  let j = aCount;
  while (j-- > 0) {
    const a = new Item();
    let i = bCount;
    while (i-- > 0) {
      const b = new Item();
      const v = fn(a, b);
    }
  }
});

bench('Wrap', () => {
  class Item {
    n = 0;
    v = 'foo';
  }
  function fn(a, b) {
    a.n++;
    return b.v;
  }

  let j = aCount;
  while (j-- > 0) {
    const a = new Item();
    const f = (b) => fn(a, b);
    let i = bCount;
    while (i-- > 0) {
      const b = new Item();
      const v = f(b);
    }
  }
});

bench('Call', () => {
  class Item {
    n = 0;
    v = 'foo';
  }
  function fn(b) {
    this.n++;
    return b.v;
  }
  let j = aCount;
  while (j-- > 0) {
    const a = new Item();
    let i = bCount;
    while (i-- > 0) {
      const b = new Item();
      const v = fn.call(a, b);
    }
  }
});

bench('Bind', () => {
  class Item {
    n = 0;
    v = 'foo';
  }
  function fn(b) {
    this.n++;
    return b.v;
  }

  let j = aCount;
  while (j-- > 0) {
    const a = new Item();
    const f = fn.bind(a);
    let i = bCount;
    while (i-- > 0) {
      const b = new Item();
      const v = f(b);
    }
  }
});

bench('Method', () => {
  class Item {
    n = 0;
    v = 'foo';
    fn(b) {
      this.n++;
      return b.v;
    }
  }

  let j = aCount;
  while (j-- > 0) {
    const a = new Item();
    let i = bCount;
    while (i-- > 0) {
      const b = new Item();
      const v = a.fn(b);
    }
  }
});

bench('# Baseline', () => {
  class Item {
    #n = 0;
    v = 'foo';
    static fn(a, b) {
      a.#n++;
      return b.v;
    }
  }
  const fn = Item.fn;

  let j = aCount;
  while (j-- > 0) {
    const a = new Item();
    let i = bCount;
    while (i-- > 0) {
      const b = new Item();
      const v = fn(a, b);
    }
  }
});

bench('# Wrap', () => {
  class Item {
    #n = 0;
    v = 'foo';
    static fn(a, b) {
      a.#n++;
      return b.v;
    }
  }
  const fn = Item.fn;

  let j = aCount;
  while (j-- > 0) {
    const a = new Item();
    const f = (b) => fn(a, b);
    let i = bCount;
    while (i-- > 0) {
      const b = new Item();
      const v = f(b);
    }
  }
});

bench('# Call', () => {
  class Item {
    #n = 0;
    v = 'foo';
    static fn(b) {
      this.#n++;
      return b.v;
    }
  }
  const fn = Item.fn;

  let j = aCount;
  while (j-- > 0) {
    const a = new Item();
    let i = bCount;
    while (i-- > 0) {
      const b = new Item();
      const v = fn.call(a, b);
    }
  }
});

bench('# Bind', () => {
  class Item {
    #n = 0;
    v = 'foo';
    static fn(b) {
      this.#n++;
      return b.v;
    }
  }
  const fn = Item.fn;

  let j = aCount;
  while (j-- > 0) {
    const a = new Item();
    const f = fn.bind(a);
    let i = bCount;
    while (i-- > 0) {
      const b = new Item();
      const v = f(b);
    }
  }
});

bench('# Method', () => {
  class Item {
    #n = 0;
    v = 'foo';
    fn(b) {
      this.#n++;
      return b.v;
    }
  }

  let j = aCount;
  while (j-- > 0) {
    const a = new Item();
    let i = bCount;
    while (i-- > 0) {
      const b = new Item();
      const v = a.fn(b);
    }
  }
});

run();
