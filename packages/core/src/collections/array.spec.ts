import { createArray } from './array.js';
import { expect } from 'chai';

describe('core: AtomArray', () => {
  it('should set value at a specific index', () => {
    const [reader, writer] = createArray<number>([0, 1, 2, 3]);
    writer.set(2, -2);
    expect(reader.unwrap()).to.deep.equal([0, 1, -2, 3]);
  });

  it('should push a value to the end of the array', () => {
    const [reader, writer] = createArray<number>();
    writer.push(1);
    expect(reader.unwrap()).to.deep.equal([1]);
  });

  it('should append multiple values to the end of the array', () => {
    const [reader, writer] = createArray<number>();
    writer.append([1, 2, 3]);
    expect(reader.unwrap()).to.deep.equal([1, 2, 3]);
  });

  it('should insert a value at a specific index', () => {
    const [reader, writer] = createArray<number>();
    writer.append([1, 3]);
    writer.insert(1, 2);
    expect(reader.unwrap()).to.deep.equal([1, 2, 3]);
  });

  it('should delete a value at a specific index', () => {
    const [reader, writer] = createArray<number>();
    writer.append([1, 2, 3]);
    writer.delete(1);
    expect(reader.unwrap()).to.deep.equal([1, 3]);
  });

  it('should swap values at two specific indices', () => {
    const [reader, writer] = createArray<number>();
    writer.append([1, 2, 3]);
    writer.swap(0, 2);
    expect(reader.unwrap()).to.deep.equal([3, 2, 1]);
  });

  it('should clear the array', () => {
    const [reader, writer] = createArray<number>();
    writer.append([1, 2, 3]);
    writer.clear();
    expect(reader.unwrap()).to.deep.equal([]);
  });
});
