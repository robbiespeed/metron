import { createDerivedArray, skipToken } from './derived.js';
import { createArray } from '../array.js';
import { expect } from 'chai';

describe('core: basic derived AtomArray', () => {
  const derive = (value: number) => value * 2;

  it('should derive values from input using passed function', () => {
    const [reader] = createArray([0, 1, 2, 3]);
    const derived = createDerivedArray(reader, derive);
    expect(derived.unwrap()).to.deep.equal([0, 2, 4, 6]);
  });

  it('should set value at a specific index', () => {
    const [reader, writer] = createArray([0, 1, 2, 3]);
    const derived = createDerivedArray(reader, derive);
    writer.set(2, -2);
    expect(derived.unwrap()).to.deep.equal([0, 2, -4, 6]);
  });

  it('should push a value to the end of the array', () => {
    const [reader, writer] = createArray<number>();
    const derived = createDerivedArray(reader, derive);
    writer.push(1);
    expect(derived.unwrap()).to.deep.equal([2]);
  });

  it('should append multiple values to the end of the array', () => {
    const [reader, writer] = createArray<number>();
    const derived = createDerivedArray(reader, derive);
    writer.append([1, 2, 3]);
    expect(derived.unwrap()).to.deep.equal([2, 4, 6]);
  });

  it('should insert a value at a specific index', () => {
    const [reader, writer] = createArray<number>();
    const derived = createDerivedArray(reader, derive);
    writer.append([1, 3]);
    writer.insert(1, 2);
    expect(derived.unwrap()).to.deep.equal([2, 4, 6]);
  });

  it('should delete a value at a specific index', () => {
    const [reader, writer] = createArray<number>();
    const derived = createDerivedArray(reader, derive);
    writer.append([1, 2, 3]);
    writer.delete(1);
    expect(derived.unwrap()).to.deep.equal([2, 6]);
  });

  it('should swap values at two specific indices', () => {
    const [reader, writer] = createArray<number>();
    const derived = createDerivedArray(reader, derive);
    writer.append([1, 2, 3]);
    writer.swap(0, 2);
    expect(derived.unwrap()).to.deep.equal([6, 4, 2]);
  });

  it('should clear the array', () => {
    const [reader, writer] = createArray([1, 2, 3]);
    const derived = createDerivedArray(reader, derive);
    writer.clear();
    expect(derived.unwrap()).to.deep.equal([]);
  });
});

describe('core: derived AtomArray with filter', () => {
  const derive = (value: number) => (value % 2 === 0 ? value : skipToken);

  it('should derive values from input using passed function', () => {
    const [reader] = createArray([0, 1, 2, 3]);
    const derived = createDerivedArray(reader, derive);
    expect(derived.unwrap()).to.deep.equal([0, 2]);
  });

  it('should set value at a specific index', () => {
    const [reader, writer] = createArray([0, 1, 2, 3]);
    const derived = createDerivedArray(reader, derive);
    writer.set(2, -2);
    expect(derived.unwrap()).to.deep.equal([0, -2]);
  });

  it('should push a value to the end of the array', () => {
    const [reader, writer] = createArray<number>();
    const derived = createDerivedArray(reader, derive);
    writer.push(1);
    expect(derived.unwrap()).to.deep.equal([]);
  });

  it('should append multiple values to the end of the array', () => {
    const [reader, writer] = createArray<number>();
    const derived = createDerivedArray(reader, derive);
    writer.append([1, 2, 3]);
    expect(derived.unwrap()).to.deep.equal([2]);
  });

  it('should insert a value at a specific index', () => {
    const [reader, writer] = createArray([1, 3]);
    const derived = createDerivedArray(reader, derive);
    expect(derived.unwrap()).to.deep.equal([]);
    writer.insert(1, 2);
    expect(derived.unwrap()).to.deep.equal([2]);
  });

  it('should delete a value at a specific index', () => {
    const [reader, writer] = createArray([1, 2, 3]);
    const derived = createDerivedArray(reader, derive);
    expect(derived.unwrap()).to.deep.equal([2]);
    writer.delete(1);
    expect(derived.unwrap()).to.deep.equal([]);
  });

  it('should swap values at two specific indices', () => {
    const [reader, writer] = createArray([1, 2, 3, 4, 5, 6]);
    const derived = createDerivedArray(reader, derive);
    expect(derived.unwrap()).to.deep.equal([2, 4, 6]);
    writer.swap(0, 3);
    expect(derived.unwrap()).to.deep.equal([4, 2, 6]);
  });

  it('should clear the array', () => {
    const [reader, writer] = createArray([1, 2, 3]);
    const derived = createDerivedArray(reader, derive);
    derived.unwrap();
    writer.clear();
    expect(derived.unwrap()).to.deep.equal([]);
  });
});
