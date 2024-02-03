import { bench, run } from 'mitata';

const count = 100_000;

const aProto = Array.prototype;
const aPush = aProto.push;

bench('push', () => {
  const arr = [];
  let i = count;
  while (i--) {
    arr.push(i);
  }
});

bench('bound push', () => {
  const arr = [];
  const push = aPush.bind(arr);
  let i = count;
  while (i--) {
    push(arr, i);
  }
});

bench('call push', () => {
  const arr = [];
  let i = count;
  while (i--) {
    aPush.call(arr, i);
  }
});

function p(a, v) {
  a[a.length] = v;
}

bench('assign a', () => {
  const arr = [];
  let i = count;
  while (i--) {
    p(arr, i);
  }
});

bench('assign b', () => {
  const arr = [];
  const push = (v) => {
    arr[arr.length] = v;
  };
  let i = count;
  while (i--) {
    push(i);
  }
});

bench('assign c', () => {
  const arr = [];
  const push = (v) => {
    arr.push(v);
  };
  let i = count;
  while (i--) {
    push(i);
  }
});

bench('assign d', () => {
  const arr = [];
  const push = (v) => {
    arr[v] = v;
  };
  arr.length = count;
  let i = 0;
  while (i < count) {
    push(i++);
  }
});

await run();
