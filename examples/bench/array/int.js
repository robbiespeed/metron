import { bench, run } from 'mitata';

const count = 10_000_000;

const size = 8;

const nums = new Array(size).fill().map((_, i) => i);

const numsB = [];
for (let i = 0; i < size; i++) {
  numsB[i] = i;
}

const ints = new Uint8Array(new Array(size).fill().map((_, i) => i));

bench('num array', () => {
  let i = count;
  // const things = [];

  while (i--) {
    const thing = [];
    for (let j = 0; j < size; j++) {
      const item = nums[j];
      const isOdd = (item & 1) === 1;
      switch (item >> 1) {
        case 0:
          thing.push(isOdd ? 'foo' : 'bar');
          break;
        case 1:
          thing.push(isOdd ? 'hello' : 'world');
          break;
        case 2:
          thing.push(isOdd ? 'Foo' : 'Bar');
          break;
        case 3:
          thing.push(isOdd ? 'Hello' : 'World');
          break;
      }
    }
    // things.push(thing);
  }
});

bench('uint8 typed array', () => {
  let i = count;
  // const things = [];

  while (i--) {
    const thing = [];
    for (let j = 0; j < size; j++) {
      const item = ints[j];
      const isOdd = (item & 1) === 1;
      switch (item >> 1) {
        case 0:
          thing.push(isOdd ? 'foo' : 'bar');
          break;
        case 1:
          thing.push(isOdd ? 'hello' : 'world');
          break;
        case 2:
          thing.push(isOdd ? 'Foo' : 'Bar');
          break;
        case 3:
          thing.push(isOdd ? 'Hello' : 'World');
          break;
      }
    }
    // things.push(thing);
  }
});

bench('num array B', () => {
  let i = count;
  // const things = [];

  while (i--) {
    const thing = [];
    for (let j = 0; j < size; j++) {
      const item = numsB[j];
      const isOdd = (item & 1) === 1;
      switch (item >> 1) {
        case 0:
          thing.push(isOdd ? 'foo' : 'bar');
          break;
        case 1:
          thing.push(isOdd ? 'hello' : 'world');
          break;
        case 2:
          thing.push(isOdd ? 'Foo' : 'Bar');
          break;
        case 3:
          thing.push(isOdd ? 'Hello' : 'World');
          break;
      }
    }
    // things.push(thing);
  }
});

run();
