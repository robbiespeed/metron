const wm = new WeakMap();
const a = [];

let i = 0;

while (true) {
  const start = performance.now();
  for (let j = 0; j < 1_000_000; j++) {
    const o = {};
    a.push(o);
    wm.set(o, i * 1_000_000 + j);
  }
  i++;
  const end = performance.now();
  console.log(
    `Total count (in millions): ${i.toLocaleString()}; ms to add items: ${
      end - start
    }`
  );
}
