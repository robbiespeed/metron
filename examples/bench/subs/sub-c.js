import { Emitter } from './lib/emitter-c.js';
import {
  emitterCount,
  runCounter,
  handleManyTypeMsgDataA,
  handleManyTypeMsgDataB,
  handleManyTypeMsgDataC,
  handleManyTypeMsgDataD,
  handleOneTypeMsgData,
  subCount,
  benchRunCount,
} from './lib/config.js';
import { assert } from 'node:console';

function setup() {
  const voidEmitters = new Array(emitterCount);

  for (let i = 0; i < emitterCount; i++) {
    const e = new Emitter();
    for (let s = 0; s < subCount; s++) {
      e.subscribe({
        '': () => {
          runCounter.voidRuns++;
        },
      });
    }
    voidEmitters[i] = e;
  }

  const oneTypeEmitters = new Array(emitterCount);

  for (let i = 0; i < emitterCount; i++) {
    const e = new Emitter();
    for (let s = 0; s < subCount; s++) {
      e.subscribe({
        one: (msg) => {
          handleOneTypeMsgData(msg);
          runCounter.oneTypeRuns++;
        },
      });
    }
    oneTypeEmitters[i] = e;
  }

  const manyTypeEmitters = new Array(emitterCount);

  for (let i = 0; i < emitterCount; i++) {
    const e = new Emitter();
    for (let s = 0; s < subCount; s++) {
      e.subscribe({
        a: handleManyTypeMsgDataA,
        b: handleManyTypeMsgDataB,
        c: handleManyTypeMsgDataC,
        d: handleManyTypeMsgDataD,
      });
    }
    manyTypeEmitters[i] = e;
  }

  return {
    voidEmitters,
    oneTypeEmitters,
    manyTypeEmitters,
  };
}

function run({ voidEmitters, oneTypeEmitters, manyTypeEmitters }) {
  const totalEmitterCount = emitterCount * 3;

  for (let i = 0; i < totalEmitterCount; i++) {
    const j = Math.trunc(i / 3);
    const n = i % 3;
    if (n === 0) {
      const type =
        i % 12 === 0 ? 'a' : i % 9 === 0 ? 'b' : i % 6 === 0 ? 'c' : 'd';

      const emitter = manyTypeEmitters[j];

      switch (type) {
        case 'a':
          emitter.send(type, i);
          break;
        case 'b':
          emitter.send(type, { a: j * 4, b: i.toString(), c: {} });
          break;
        case 'c':
          emitter.send(type, { a: j * 4, b: i.toString(), d: i, e: [] });
          break;
        case 'd':
          emitter.send(type, { f: i.toString() });
          break;
      }
    } else if (n === 1) {
      const numKeys = i % 20;
      const variant = i % 2 === 0;
      const o = {};
      for (let k = 0; k < numKeys; k++) {
        o[variant ? `a${k}` : `b${k}`] = k;
      }
      oneTypeEmitters[j].send('one', o);
    } else {
      voidEmitters[j].send('');
    }
  }
}

function bench() {
  const params = setup();
  for (let i = 0; i < benchRunCount; i++) {
    run(params);
  }

  const expectedEmitRuns = benchRunCount * emitterCount * subCount;

  assert(runCounter.voidRuns === expectedEmitRuns);
  assert(runCounter.oneTypeRuns === expectedEmitRuns);
  assert(runCounter.manyTypeRuns === expectedEmitRuns);
}

bench();
