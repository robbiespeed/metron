import { bench, run } from 'mitata';

const count = 100_000;

bench('D', () => {
  function setFoo(key, value, thing) {
    thing[key] = value;
  }
  function setBar(key, value, thing) {
    thing.stuff.set(key, value);
  }
  let r = count;
  function runInst(instructions, keys, data, state, thing) {
    const end = instructions.length;
    for (let i = 0; i < end; i++) {
      const inst = instructions[i];
      const value = inst & 0b01 ? data[i] : state[data[i]];
      if (value == null) {
        continue;
      }

      switch (inst & 0b10) {
        case 0b00:
          setFoo(keys[i], value, thing);
          break;
        case 0b10:
          setBar(keys[i], value, thing);
          break;
      }
    }
  }
  const instructions = [0b00, 0b01, 0b10, 0b11];
  const state = { a: 1, b: 2 };
  const keys = ['x', 'y', 'z', 'a'];
  const data = ['a', 3, 'b', null];
  while (r--) {
    runInst(instructions, data, state, { x: null, y: null, stuff: new Map() });
  }
});

bench('D alt', () => {
  let r = count;
  function runInst(instructions, keys, data, state, thing) {
    const end = instructions.length;
    for (let i = 0; i < end; i++) {
      const inst = instructions[i];
      const value = inst & 0b01 ? data[i] : state[data[i]];
      if (value == null) {
        continue;
      }

      switch (inst & 0b10) {
        case 0b00:
          thing[keys[i]] = value;
          break;
        case 0b10:
          thing.stuff.set(keys[i], value);
          break;
      }
    }
  }
  const instructions = [0b00, 0b01, 0b10, 0b11];
  const state = { a: 1, b: 2 };
  const keys = ['x', 'y', 'z', 'a'];
  const data = ['a', 3, 'b', null];
  while (r--) {
    runInst(instructions, data, state, { x: null, y: null, stuff: new Map() });
  }
});

bench('D alt2', () => {
  let r = count;
  function runInst(instructions, keys, data, state, thing) {
    const end = instructions.length;
    for (let i = 0; i < end; i++) {
      const inst = instructions[i];
      const value = (inst & 0b01) === 0b01 ? data[i] : state[data[i]];
      if (value == null) {
        continue;
      }

      switch (inst & 0b10) {
        case 0b00:
          thing[keys[i]] = value;
          break;
        case 0b10:
          thing.stuff.set(keys[i], value);
          break;
      }
    }
  }
  const instructions = [0b00, 0b01, 0b10, 0b11];
  const state = { a: 1, b: 2 };
  const keys = ['x', 'y', 'z', 'a'];
  const data = ['a', 3, 'b', null];
  while (r--) {
    runInst(instructions, data, state, { x: null, y: null, stuff: new Map() });
  }
});

bench('A', () => {
  let r = count;
  function setFoo(key, value, thing) {
    thing[key] = value;
  }
  function setBar(key, value, thing) {
    thing.stuff.set(key, value);
  }
  function runInst(instructions, data, state, thing) {
    const end = instructions.length;
    let j = 0;
    for (let i = 0; i < end; i++, j++) {
      const inst = instructions[i];
      const value = inst & 0b01 ? data[j++] : state[data[j++]];
      if (value == null) {
        continue;
      }

      switch (inst & 0b10) {
        case 0b00:
          setFoo(data[j], value, thing);
          break;
        case 0b10:
          setBar(data[j], value, thing);
          break;
      }
    }
  }
  const instructions = [0b00, 0b01, 0b10, 0b11];
  const state = { a: 1, b: 2 };
  const data = ['a', 'x', 3, 'y', 'b', 'z', null, 'a'];
  while (r--) {
    runInst(instructions, data, state, { x: null, y: null, stuff: new Map() });
  }
});

bench('A alt', () => {
  let r = count;
  function setFoo(key, value, thing) {
    thing[key] = value;
  }
  function setBar(key, value, thing) {
    thing.stuff.set(key, value);
  }
  function runInst(instructions, data, state, thing) {
    const end = instructions.length;
    let j = 0;
    for (let i = 0; i < end; i++, j++) {
      const inst = instructions[i];
      const value = inst & 0b01 ? data[j++] : state[data[j++]];
      if (value == null) {
        continue;
      }

      switch (inst & 0b10) {
        case 0b00:
          thing[data[j]] = value;
          break;
        case 0b10:
          thing.stuff.set(data[j], value);
          break;
      }
    }
  }
  const instructions = [0b00, 0b01, 0b10, 0b11];
  const state = { a: 1, b: 2 };
  const data = ['a', 'x', 3, 'y', 'b', 'z', null, 'a'];
  while (r--) {
    runInst(instructions, data, state, { x: null, y: null, stuff: new Map() });
  }
});

bench('B', () => {
  let r = count;
  function setFoo(key, value, state, thing) {
    if (value == null) {
      return;
    }
    thing[key] = value;
  }
  function setBar(key, value, state, thing) {
    if (value == null) {
      return;
    }
    thing.stuff.set(key, value);
  }
  function setFooKey(key, stateKey, state, thing) {
    const value = state[stateKey];
    if (value == null) {
      return;
    }
    thing[key] = value;
  }
  function setBarKey(key, stateKey, state, thing) {
    const value = state[stateKey];
    if (value == null) {
      return;
    }
    thing.stuff.set(key, value);
  }
  function runInst(instructions, state, thing) {
    const end = instructions.length;
    for (let i = 0; i < end; i++) {
      instructions[i](state, thing);
    }
  }
  const instructions = [
    setFooKey.bind(undefined, 'x', 'a'),
    setFoo.bind(undefined, 'y', 3),
    setBarKey.bind(undefined, 'z', 'b'),
    setBar.bind(undefined, 'a', null),
  ];
  const state = { a: 1, b: 2 };
  while (r--) {
    runInst(instructions, state, { x: null, y: null, stuff: new Map() });
  }
});

bench('C', () => {
  let r = count;
  function setFoo(key, value, thing) {
    thing[key] = value;
  }
  function setBar(key, value, thing) {
    thing.stuff.set(key, value);
  }
  function get(stateKey, state) {
    return state[stateKey];
  }
  function identity(value) {
    return value;
  }
  function runInst(instructions, state, thing) {
    const end = instructions.length;
    for (let i = 0; i < end; i++) {
      const value = instructions[i++](state);
      if (value == null) {
        continue;
      }
      instructions[i](value, thing);
    }
  }
  const instructions = [
    get.bind(undefined, 'a'),
    setFoo.bind(undefined, 'x'),
    identity.bind(undefined, 3),
    setFoo.bind(undefined, 'y'),
    get.bind(undefined, 'b'),
    setBar.bind(undefined, 'z'),
    identity.bind(undefined, null),
    setBar.bind(undefined, 'a'),
  ];
  const state = { a: 1, b: 2 };
  while (r--) {
    runInst(instructions, state, { x: null, y: null, stuff: new Map() });
  }
});

await run();
