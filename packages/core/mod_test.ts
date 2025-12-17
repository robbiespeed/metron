import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { derive, state } from "@metron/core";

describe("state", () => {
  it("should init", () => {
    const [v] = state(0);
    expect(v.unwrap()).toBe(0);
  });
  it("should update", () => {
    const [v, setV] = state(0);
    setV(1);
    expect(v.unwrap()).toBe(1);
  });
});

describe("derive", () => {
  it("should init", () => {
    const [s] = state(1);
    const d = derive((read) => read(s) * 2);
    expect(d.unwrap()).toBe(2);
  });
  it("should update", () => {
    const [s, setS] = state(1);
    const d = derive((read) => read(s) * 2);
    expect(d.unwrap()).toBe(2);
    setS(3);
    expect(d.unwrap()).toBe(6);
  });
  it("should only update for active source changes", () => {
    const [a, setA] = state(1);
    const [b, setB] = state(5);
    let count = 0;
    const d = derive((read) => {
      count++;
      return read(a) === 1 ? read(b) : a.unwrap()
    });
    expect(d.unwrap()).toBe(5);
    expect(count).toBe(1);
    setA(2);
    expect(d.unwrap()).toBe(2);
    expect(count).toBe(2);
    setB(6);
    expect(d.unwrap()).toBe(2);
    expect(count).toBe(2);
  });
});