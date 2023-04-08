import { expect } from 'chai';
import { it } from 'mocha';
import { foo } from './lib';

it('should pass', () => {
  expect(foo()).to.equal(1);
});
