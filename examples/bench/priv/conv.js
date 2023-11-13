class Foo {
  _state = 1;
  _inc = 13;

  run() {
    let n = 100000;
    while (n-- > 0) {
      this._state += this._inc;
    }
    return n;
  }
}

let i = 1000;
while (i > 0) {
  i--;
  new Foo().run();
}
