import { bench, run } from 'mitata';

const nCount = 10000;

function syncRunner(gen) {
  let r = gen.next();
  while (r.done === false) {
    r = gen.next(r.value);
  }
  return r.value;
}

bench('Generator (sync runner)', () => {
  function* g() {
    let x = yield 1;
    let n = 0;
    while (n++ < nCount) {
      x = yield n;
    }
    return x;
  }

  syncRunner(g());
});

async function asyncRunner(gen) {
  let r = gen.next();
  while (r.done === false) {
    r = gen.next(await r.value);
  }
  return r.value;
}

bench('Generator (async runner)', async () => {
  function* g() {
    let x = yield 1;
    let n = 0;
    while (n++ < nCount) {
      x = yield n;
    }
    return x;
  }

  await asyncRunner(g());
});

bench('Async', async () => {
  async function a() {
    let x = await 1;
    let n = 0;
    while (n++ < nCount) {
      x = await n;
    }
    return x;
  }

  await a();
});

await run();
