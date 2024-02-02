import { expect } from 'chai';
import { createSet, createMappedSet, createFilteredSet } from './set.js';
import { runMessageQueueCleanup } from './message-queue.js';

describe('collections: AtomSet', () => {
  describe('Primary', () => {
    it('should create an AtomSet with initial values', () => {
      const values = [1, 2, 3];
      const [set] = createSet(values);
      expect([...set.unwrap()]).to.deep.equal(values);
    });

    it('should create an empty AtomSet if no initial values are provided', () => {
      const [set] = createSet();
      expect([...set.unwrap()]).to.deep.equal([]);
    });

    it('should add values to the AtomSet', () => {
      const [set, writer] = createSet();
      writer.add(1);
      writer.add(2);
      writer.add(3);
      expect([...set.unwrap()]).to.deep.equal([1, 2, 3]);
    });

    it('should delete values from the AtomSet', () => {
      const [set, writer] = createSet([1, 2, 3]);
      writer.delete(2);
      expect([...set.unwrap()]).to.deep.equal([1, 3]);
    });

    it('should clear the AtomSet', () => {
      const [set, writer] = createSet([1, 2, 3]);
      writer.clear();
      expect([...set.unwrap()]).to.deep.equal([]);
    });
  });

  describe('Mapped', () => {
    it('should create a mapped AtomSet', () => {
      const [inputSet] = createSet([1, 2, 3]);
      const mapper = (value: number) => value * 2;
      const mappedSet = createMappedSet(inputSet, mapper);
      expect([...mappedSet.unwrap()]).to.deep.equal([2, 4, 6]);
    });

    it('should update the mapped AtomSet when values are added to the input set', () => {
      const [inputSet, inputWriter] = createSet([1, 2, 3]);
      const mapper = (value: number) => value * 2;
      const mappedSet = createMappedSet(inputSet, mapper);
      inputWriter.add(4);
      expect([...mappedSet.unwrap()]).to.deep.equal([2, 4, 6, 8]);
    });

    it('should update the mapped AtomSet when values are deleted from the input set', () => {
      const [inputSet, inputWriter] = createSet([1, 2, 3]);
      const mapper = (value: number) => value * 2;
      const mappedSet = createMappedSet(inputSet, mapper);
      inputWriter.delete(2);
      expect([...mappedSet.unwrap()]).to.deep.equal([2, 6]);
    });

    it('should clear the mapped AtomSet when the input set is cleared', () => {
      const [inputSet, inputWriter] = createSet([1, 2, 3]);
      const mapper = (value: number) => value * 2;
      const mappedSet = createMappedSet(inputSet, mapper);
      inputWriter.clear();
      expect([...mappedSet.unwrap()]).to.deep.equal([]);
    });

    it('should update the mapped AtomSet after clearing the input set and adding new values', () => {
      const [inputSet, inputWriter] = createSet([1, 2, 3]);
      const mapper = (value: number) => value * 2;
      const mappedSet = createMappedSet(inputSet, mapper);
      inputWriter.clear();
      mappedSet.unwrap();
      inputWriter.add(1);
      inputWriter.add(2);
      inputWriter.add(3);
      expect([...mappedSet.unwrap()]).to.deep.equal([2, 4, 6]);
    });

    it('should reset out of date mapped AtomSet if a cleanup has occurred', () => {
      const [inputSet, inputWriter] = createSet([1, 2, 3]);
      let x = 2;
      const mapper = (value: number) => value * x;
      const mappedSet = createMappedSet(inputSet, mapper);
      mappedSet.unwrap();
      inputWriter.add(4);
      runMessageQueueCleanup();
      x = 3;
      expect([...mappedSet.unwrap()]).to.deep.equal([3, 6, 9, 12]);
    });
  });

  describe('Filtered', () => {
    it('should create a filtered AtomSet', () => {
      const [inputSet] = createSet([1, 2, 3]);
      const predicate = (value: number) => value % 2 === 0;
      const filteredSet = createFilteredSet(inputSet, predicate);
      expect([...filteredSet.unwrap()]).to.deep.equal([2]);
    });

    it('should update the filtered AtomSet when values are added to the input set', () => {
      const [inputSet, inputWriter] = createSet([1, 2, 3]);
      const predicate = (value: number) => value % 2 === 0;
      const filteredSet = createFilteredSet(inputSet, predicate);
      inputWriter.add(4);
      expect([...filteredSet.unwrap()]).to.deep.equal([2, 4]);
    });

    it('should update the filtered AtomSet when values are deleted from the input set', () => {
      const [inputSet, inputWriter] = createSet([1, 2, 3]);
      const predicate = (value: number) => value % 2 === 0;
      const filteredSet = createFilteredSet(inputSet, predicate);
      inputWriter.delete(2);
      expect([...filteredSet.unwrap()]).to.deep.equal([]);
    });

    it('should clear the filtered AtomSet when the input set is cleared', () => {
      const [inputSet, inputWriter] = createSet([1, 2, 3]);
      const predicate = (value: number) => value % 2 === 0;
      const filteredSet = createFilteredSet(inputSet, predicate);
      inputWriter.clear();
      expect([...filteredSet.unwrap()]).to.deep.equal([]);
    });
  });
});
