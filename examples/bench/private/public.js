class A {
  _value;
  constructor(value) {
    this._value = value;
  }
  get value() {
    return this._value;
  }
  set value(value) {
    this._value = value;
  }
}

const items = new Array(1_000_000).fill().map((_, i) => new A(i));

for (let i = 0; i < 1_000; i++) {
  for (const item of items) {
    item.value = item.value + 1;
  }
}
