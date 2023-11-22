function fn() {
  return this;
}

console.log(typeof fn.bind(undefined)());
console.log(typeof fn.bind(2)());
