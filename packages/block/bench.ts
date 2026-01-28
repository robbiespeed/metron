import { expect } from "@std/expect";

const basicString = `
  This is some text, it's pretty basic text.
  There's no special surrogate characters.
  There are a lot of basic characters.
  There are a lot of basic characters.
  There are a lot of basic characters.
  There are a lot of basic characters.
  There are a lot of basic characters.
  There are a lot of basic characters.
  There are a lot of basic characters.
  There are a lot of basic characters.
  There are a lot of basic characters.
  There are a lot of basic characters.
  There are a lot of basic characters.
  There are a lot of basic characters.
  There are a lot of basic characters.
  There are a lot of basic characters.
  There are a lot of basic characters.
  There are a lot of basic characters.
  There are a lot of basic characters.
  There are a lot of basic characters.
`;

const specialString = `
  This is some special text 😄, it's very 🚀.
  There are ✅ some special surrogate characters.
  There are a lot of special 💎 characters.
  There are a lot of special 💎 characters.
  There are a lot of special 💎 characters.
  There are a lot of special 💎 characters.
  There are a lot of special 💎 characters.
  There are a lot of special 💎 characters.
  There are a lot of special 💎 characters.
  There are a lot of special 💎 characters.
  There are a lot of special 💎 characters.
  There are a lot of special 💎 characters.
  There are a lot of special 💎 characters.
  There are a lot of special 💎 characters.
  There are a lot of special 💎 characters.
  There are a lot of special 💎 characters.
  There are a lot of special 💎 characters.
  There are a lot of special 💎 characters.
  There are a lot of special 💎 characters.
  There are a lot of special 💎 characters.
`;

// const specialString = `
//   This is some special text 😄, it's very 🚀.
//   There are ✅ some special surrogate characters.
// `;

function parseWithCodePoint(text: string) {
  let i = 0;
  const endI = text.length;
  const out = [];
  while (i < endI) {
    const codePoint = text.codePointAt(i)!;
    if (codePoint < 0xdc00 || codePoint > 0xdfff) {
      out.push(codePoint);
    }
    i++;
  }
  return out;
}

function parseWithCodePointIter(text: string) {
  const out = [];
  for (const char of text) {
    const codePoint = char.codePointAt(0)!;
    if (codePoint < 0xdc00 || codePoint > 0xdfff) {
      out.push(codePoint);
    }
  }
  return out;
}

function parseWithCharCode(text: string) {
  let i = 0;
  const endI = text.length;
  const out = [];
  while (i < endI) {
    const charCode = text.charCodeAt(i);
    if (charCode < 0xd800 || charCode > 0xdfff) {
      out.push(charCode);
    } else {
      i++;
      out.push((charCode - 0xd800) * 0x400 + 0x2400 + text.charCodeAt(i));
    }
    i++;
  }
  return out;
}

let outA = parseWithCodePoint(basicString);
let outB = parseWithCodePointIter(basicString);
let outC = parseWithCharCode(basicString);

expect(outA.every((v, i) => v === outB[i] && v === outC[i])).toBeTruthy();

outA = parseWithCodePoint(specialString);
outB = parseWithCodePointIter(specialString);
outC = parseWithCharCode(specialString);

expect(outA.every((v, i) => v === outB[i] && v === outC[i])).toBeTruthy();

Deno.bench("parseWithCodePoint basic", () => {
  parseWithCodePoint(basicString);
});

Deno.bench("parseWithCodePointIter basic", () => {
  parseWithCodePointIter(basicString);
});

Deno.bench("parseWithCharCode basic", () => {
  parseWithCharCode(basicString);
});

Deno.bench("parseWithCodePoint special", () => {
  parseWithCodePoint(specialString);
});

Deno.bench("parseWithCodePointIter special", () => {
  parseWithCodePointIter(specialString);
});

Deno.bench("parseWithCharCode special", () => {
  parseWithCharCode(specialString);
});