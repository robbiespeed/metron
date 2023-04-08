import { expect } from 'chai';
import { it } from 'mocha';
import { bar } from './lib';

it('should pass', () => {
  expect(bar()).to.equal(2);
});
