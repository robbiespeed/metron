class Foo {
  #state = 1;
  #inc = 13;

  run() {
    let n = 100000;
    while (n-- > 0) {
      this.#state += this.#inc;
    }
    return n;
  }
}

let i = 1000;
while (i > 0) {
  i--;
  new Foo().run();
}
