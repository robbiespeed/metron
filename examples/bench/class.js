class Foo {
  bar = () => this.#bar();
  #bar() {
    return 'bar';
  }
  baz() {
    return 'baz';
  }
}

const f = new Foo();

Object.setPrototypeOf(f, null);

console.log(f.baz);

console.log(f.bar());
