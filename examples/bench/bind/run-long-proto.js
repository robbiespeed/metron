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
  class FooB extends Foo {
    constructor(a, d, e) {
      super(a);
      this.d = d;
      this.e = e;
    }
    otherB() {
      return this.d + this.e;
    }
  }
  class FooC extends FooB {
    constructor(f) {
      super(0, 1, 2);
      this.f = f;
    }
    otherC() {
      return this.f;
    }
  }
  const foo = new FooC();
  foo.z = 0;
  let i = count;
  while (i--) {
    foo.bar(0, i);
  }
});

bench('call', () => {
  class Foo {
    constructor(a) {
      this.a = a;
    }
    bar(b, c) {
      return c % this.a === b;
    }
  }
  class FooB extends Foo {
    constructor(a, d, e) {
      super(a);
      this.d = d;
      this.e = e;
    }
    otherB() {
      return this.d + this.e;
    }
  }
  class FooC extends FooB {
    constructor(f) {
      super(0, 1, 2);
      this.f = f;
    }
    otherC() {
      return this.f;
    }
  }
  const foo = new FooC();
  foo.z = 0;
  const bar = Foo.prototype.bar;
  let i = count;
  while (i--) {
    bar.call(foo, 0, i);
  }
});

bench('bind', () => {
  class Foo {
    constructor(a) {
      this.a = a;
    }
    bar(b, c) {
      return c % this.a === b;
    }
  }
  class FooB extends Foo {
    constructor(a, d, e) {
      super(a);
      this.d = d;
      this.e = e;
    }
    otherB() {
      return this.d + this.e;
    }
  }
  class FooC extends FooB {
    constructor(f) {
      super(0, 1, 2);
      this.f = f;
    }
    otherC() {
      return this.f;
    }
  }
  const foo = new FooC();
  foo.z = 0;
  const bar = Foo.prototype.bar.bind(foo, 0);
  let i = count;
  while (i--) {
    bar(i);
  }
});

await run();
