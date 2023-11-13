class A {
  value;
  constructor(value) {
    this.value = value;
  }
}

const items = new Array(1_000_000).fill().map((_, i) => new A(i));

for (let i = 0; i < 1_000; i++) {
  for (const item of items) {
    item.value = item.value + 1;
  }
}
