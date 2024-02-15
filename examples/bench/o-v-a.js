import { bench, run } from 'mitata';

const count = 500_000;

bench('object', () => {
  const a = [];
  const handler = (data) => {
    console.log('Hey', data);
  };
  let i = count;
  while (i--) {
    a.push({ handler, data: i });
  }
});

bench('array', () => {
  const a = [];
  const handler = (data) => {
    console.log('Hey', data);
  };
  let i = count;
  while (i--) {
    a.push([handler, i]);
  }
});

await run();
