import { bench, run } from 'mitata';

const count = 500_000;

bench('baseline a', () => {
  class Foo {
    constructor(a) {
      this.a = a;
    }
    bar(b, c) {
      return c % this.a === b;
    }
  }
  const foo = new Foo(2);
  let i = count;
  while (i--) {
    foo.bar(0, i);
  }
});

bench('baseline b', () => {
  const foo = [];
  let i = count;
  while (i--) {
    foo.push(i);
  }
});

bench('call a', () => {
  class Foo {
    constructor(a) {
      this.a = a;
    }
    bar(b, c) {
      return c % this.a === b;
    }
  }
  const foo = new Foo(2);
  const bar = Foo.prototype.bar;
  let i = count;
  while (i--) {
    bar.call(foo, 0, i);
  }
});

bench('call b', () => {
  const foo = [];
  const push = Array.prototype.push;
  let i = count;
  while (i--) {
    push.call(foo, i);
  }
});

bench('bind a', () => {
  class Foo {
    constructor(a) {
      this.a = a;
    }
    bar(b, c) {
      return c % this.a === b;
    }
  }
  const foo = new Foo(2);
  const bar = Foo.prototype.bar.bind(foo, 0);
  let i = count;
  while (i--) {
    bar(i);
  }
});

bench('bind b', () => {
  const foo = [];
  const push = Array.prototype.push.bind(foo);
  let i = count;
  while (i--) {
    push(i);
  }
});

bench('wrap a', () => {
  class Foo {
    constructor(a) {
      this.a = a;
    }
    bar(b, c) {
      return c % this.a === b;
    }
  }
  const foo = new Foo(2);
  const bar = (c) => foo.bar(0, c);
  let i = count;
  while (i--) {
    bar(i);
  }
});

bench('wrap b', () => {
  const foo = [];
  const push = (a) => foo.push(a);
  let i = count;
  while (i--) {
    push(i);
  }
});

bench('wrap b alt', () => {
  const foo = [];
  const push = (a) => {
    foo.push(a);
  };
  let i = count;
  while (i--) {
    push(i);
  }
});

await run();
