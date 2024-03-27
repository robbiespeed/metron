import { bench, run } from 'mitata';

const iCount = 10_000;

bench('Spread create, static, small', () => {
  let i = iCount;
  const base = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 };
  while (i-- > 0) {
    const o = { ...base };
  }
});

bench('Spread create, Entries init, small', () => {
  let i = iCount;
  const base = { a: 1, b: 2, c: 3 };
  const dynamic = [
    ['d', 4],
    ['e', 5],
    ['f', 6],
  ];
  while (i-- > 0) {
    const o = { ...base };
    for (let j = 0; j < dynamic.length; j++) {
      const [key, value] = dynamic[j];
      o[key] = value != null && value > 3 && value % 2 ? value + 1 : value;
    }
  }
});

bench('Spread create alt, Entries init, small', () => {
  let i = iCount;
  const base = Object.fromEntries([
    ['a', 1],
    ['b', 2],
    ['c', 3],
  ]);
  const dynamic = [
    ['d', 4],
    ['e', 5],
    ['f', 6],
  ];
  while (i-- > 0) {
    const o = { ...base };
    for (let j = 0; j < dynamic.length; j++) {
      const [key, value] = dynamic[j];
      o[key] = value != null && value > 3 && value % 2 ? value + 1 : value;
    }
  }
});

bench('Spread create, Object init, small', () => {
  let i = iCount;
  const base = { a: 1, b: 2, c: 3 };
  const dynamic = { d: 4, e: 5, f: 6 };
  while (i-- > 0) {
    const o = { ...base };
    for (const key in dynamic) {
      const value = dynamic[key];
      o[key] = value != null && value > 3 && value % 2 ? value + 1 : value;
    }
  }
});

bench('Entries create, Entries init, small', () => {
  let i = iCount;
  const base = [
    ['a', 1],
    ['b', 2],
    ['c', 3],
  ];
  const dynamic = [
    ['d', 4],
    ['e', 5],
    ['f', 6],
  ];
  while (i-- > 0) {
    // const o = Object.create(null);
    const o = {};
    for (let j = 0; j < base.length; j++) {
      const [key, value] = base[j];
      o[key] = value;
    }
    for (let j = 0; j < dynamic.length; j++) {
      const [key, value] = dynamic[j];
      o[key] = value != null && value > 3 && value % 2 ? value + 1 : value;
    }
  }
});

bench('Entries create, Entries init, small alt', () => {
  let i = iCount;
  const keys = ['a', 'b', 'c', 'd', 'e', 'f'];
  const values = [1, 2, 3, 4, 5, 6];
  const dynamicStart = 3;
  const dynamicEnd = 6;
  while (i-- > 0) {
    // const o = Object.create(null);
    const o = {};
    let j = 0;
    for (; j < dynamicStart; j++) {
      o[keys[j]] = values[j];
    }
    for (; j < dynamicEnd; j++) {
      const value = values[j];
      o[keys[j]] = value != null && value > 3 && value % 2 ? value + 1 : value;
    }
  }
});

bench('Entries create + init, small', () => {
  let i = iCount;
  const dynamic = [
    ['a', 1],
    ['b', 2],
    ['c', 3],
    ['d', 4],
    ['e', 5],
    ['f', 6],
  ];
  while (i-- > 0) {
    const o = {};
    for (let j = 0; j < dynamic.length; j++) {
      const [key, value] = dynamic[j];
      o[key] = value != null && value > 3 && value % 2 ? value + 1 : value;
    }
  }
});

bench('Entries create, Entries init, small alt', () => {
  let i = iCount;
  const keys = ['a', 'b', 'c', 'd', 'e', 'f'];
  const values = [1, 2, 3, 4, 5, 6];
  const dynamicStart = 0;
  const dynamicEnd = 6;
  while (i-- > 0) {
    // const o = Object.create(null);
    const o = {};
    let j = 0;
    for (; j < dynamicStart; j++) {
      o[keys[j]] = values[j];
    }
    for (; j < dynamicEnd; j++) {
      const value = values[j];
      o[keys[j]] = value != null && value > 3 && value % 2 ? value + 1 : value;
    }
  }
});

bench('Entries create, Entries init, small alt (instruct)', () => {
  let i = iCount;
  const instructions = [
    (3 << 16) | (1 << 8),
    0,
    (2 << 16) | (4 << 8),
    (4 << 16) | (2 << 8) | 1,
    (1 << 16) | (3 << 8),
    (5 << 16) | (5 << 8) | 1,
  ];
  const keys = ['b', 'e', 'c', 'a', 'd', 'f'];
  const values = [2, 1, 4, 5, 3, 6];
  const dynamicStart = 0;
  const dynamicEnd = 6;
  while (i-- > 0) {
    // const o = Object.create(null);
    const o = {};
    let j = 0;
    for (; j < dynamicStart; j++) {
      const x = instructions[j];

      o[keys[x >> 16]] = values[(x >> 8) & 0xff];
    }
    for (; j < dynamicEnd; j++) {
      const x = instructions[j];
      const value = values[(x >> 8) & 0xff];
      o[keys[x >> 16]] = x & 0b1 ? value + 1 : value;
    }
  }
});

bench('Entries create, Entries init, large', () => {
  let i = iCount;
  const base = [
    ['a', 1],
    ['b', 2],
    ['c', 3],
    ['d', 4],
    ['e', 5],
    ['f', 6],
    ['g', 7],
    ['h', 8],
    ['i', 9],
    ['j', 10],
    ['k', 11],
    ['l', 12],
  ];
  const dynamic = [
    ['m', 13],
    ['n', 14],
    ['o', 15],
    ['p', 16],
    ['q', 17],
    ['r', 18],
    ['s', 19],
    ['t', 20],
    ['u', 21],
    ['v', 22],
    ['w', 23],
    ['x', 24],
  ];
  while (i-- > 0) {
    // const o = Object.create(null);
    const o = {};
    for (let j = 0; j < base.length; j++) {
      const [key, value] = base[j];
      o[key] = value;
    }
    for (let j = 0; j < dynamic.length; j++) {
      const [key, value] = dynamic[j];
      o[key] = value != null && value > 3 && value % 2 ? value + 1 : value;
    }
  }
});

bench('Entries create, Entries init, large alt', () => {
  let i = iCount;
  const keys = [
    'a',
    'b',
    'c',
    'd',
    'e',
    'f',
    'g',
    'h',
    'i',
    'j',
    'k',
    'l',
    'm',
    'n',
    'o',
    'p',
    'q',
    'r',
    's',
    't',
    'u',
    'v',
    'w',
    'x',
  ];
  const values = [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
    22, 23, 24,
  ];
  const dynamicStart = 12;
  const dynamicEnd = 24;
  while (i-- > 0) {
    // const o = Object.create(null);
    const o = {};
    let j = 0;
    for (; j < dynamicStart; j++) {
      o[keys[j]] = values[j];
    }
    for (; j < dynamicEnd; j++) {
      const value = values[j];
      o[keys[j]] = value != null && value > 3 && value % 2 ? value + 1 : value;
    }
  }
});

bench('Entries create, Entries init, large alt (instruct)', () => {
  let i = iCount;
  const instructions = [
    (3 << 16) | (1 << 8),
    0,
    (2 << 16) | (4 << 8),
    (4 << 16) | (2 << 8),
    (1 << 16) | (3 << 8),
    (5 << 16) | (5 << 8),
    (6 << 16) | (6 << 8),
    (7 << 16) | (7 << 8),
    (8 << 16) | (8 << 8),
    (9 << 16) | (9 << 8),
    (10 << 16) | (10 << 8),
    (11 << 16) | (11 << 8),
    (12 << 16) | (12 << 8),
    (13 << 16) | (13 << 8) | 1,
    (14 << 16) | (14 << 8),
    (23 << 16) | (23 << 8) | 1,
    (15 << 16) | (15 << 8) | 1,
    (16 << 16) | (16 << 8),
    (17 << 16) | (17 << 8) | 1,
    (18 << 16) | (18 << 8),
    (19 << 16) | (19 << 8) | 1,
    (20 << 16) | (20 << 8),
    (21 << 16) | (21 << 8) | 1,
    (22 << 16) | (22 << 8),
  ];
  const keys = [
    'b',
    'e',
    'c',
    'a',
    'd',
    'f',
    'g',
    'h',
    'i',
    'j',
    'k',
    'l',
    'm',
    'n',
    'o',
    'x',
    'p',
    'q',
    'r',
    's',
    't',
    'u',
    'v',
    'w',
  ];
  const values = [
    2, 1, 4, 5, 3, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 24, 16, 17, 18, 19, 20,
    21, 22, 23,
  ];
  const dynamicStart = 12;
  const dynamicEnd = 24;
  while (i-- > 0) {
    // const o = Object.create(null);
    const o = {};
    let j = 0;
    for (; j < dynamicStart; j++) {
      const x = instructions[j];

      o[keys[x >> 16]] = values[(x >> 8) & 0xff];
    }
    for (; j < dynamicEnd; j++) {
      const x = instructions[j];
      const value = values[(x >> 8) & 0xff];
      o[keys[x >> 16]] = x & 0b1 ? value + 1 : value;
    }
  }
});

bench(
  'Entries create, Entries init, large alt (instruct, dynamic only)',
  () => {
    let i = iCount;
    const instructions = [
      (3 << 16) | (1 << 8),
      0,
      (2 << 16) | (4 << 8),
      (4 << 16) | (2 << 8),
      (1 << 16) | (3 << 8),
      (5 << 16) | (5 << 8),
      (6 << 16) | (6 << 8),
      (7 << 16) | (7 << 8) | 1,
      (8 << 16) | (8 << 8),
      (9 << 16) | (9 << 8) | 1,
      (10 << 16) | (10 << 8),
      (11 << 16) | (11 << 8) | 1,
      (12 << 16) | (12 << 8),
      (13 << 16) | (13 << 8) | 1,
      (14 << 16) | (14 << 8),
      (23 << 16) | (23 << 8) | 1,
      (15 << 16) | (15 << 8) | 1,
      (16 << 16) | (16 << 8),
      (17 << 16) | (17 << 8) | 1,
      (18 << 16) | (18 << 8),
      (19 << 16) | (19 << 8) | 1,
      (20 << 16) | (20 << 8),
      (21 << 16) | (21 << 8) | 1,
      (22 << 16) | (22 << 8),
    ];
    const keys = [
      'b',
      'e',
      'c',
      'a',
      'd',
      'f',
      'g',
      'h',
      'i',
      'j',
      'k',
      'l',
      'm',
      'n',
      'o',
      'x',
      'p',
      'q',
      'r',
      's',
      't',
      'u',
      'v',
      'w',
    ];
    const values = [
      2, 1, 4, 5, 3, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 24, 16, 17, 18, 19, 20,
      21, 22, 23,
    ];
    const dynamicEnd = 24;
    while (i-- > 0) {
      // const o = Object.create(null);
      const o = {};
      let j = 0;
      for (; j < dynamicEnd; j++) {
        const x = instructions[j];
        const value = values[(x >> 8) & 0xff];
        o[keys[x >> 16]] = x & 0b1 ? value + 1 : value;
      }
    }
  }
);

bench('Entries create + init, large', () => {
  let i = iCount;
  const dynamic = [
    ['a', 1],
    ['b', 2],
    ['c', 3],
    ['d', 4],
    ['e', 5],
    ['f', 6],
    ['g', 7],
    ['h', 8],
    ['i', 9],
    ['j', 10],
    ['k', 11],
    ['l', 12],
    ['m', 13],
    ['n', 14],
    ['o', 15],
    ['p', 16],
    ['q', 17],
    ['r', 18],
    ['s', 19],
    ['t', 20],
    ['u', 21],
    ['v', 22],
    ['w', 23],
    ['x', 24],
  ];
  while (i-- > 0) {
    const o = {};
    for (let j = 0; j < dynamic.length; j++) {
      const [key, value] = dynamic[j];
      o[key] = value != null && value > 3 && value % 2 ? value + 1 : value;
    }
  }
});

// Slower than fully dynamic
// bench('Entries create, static, small', () => {
//   let i = iCount;
//   const base = [
//     ['a', 1],
//     ['b', 2],
//     ['c', 3],
//     ['d', 4],
//     ['e', 5],
//     ['f', 6],
//   ];
//   while (i-- > 0) {
//     const o = Object.fromEntries(base);
//   }
// });

await run();
