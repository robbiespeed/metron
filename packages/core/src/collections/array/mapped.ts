import { createRelayOrb } from 'metron-core/orb.js';
import type { AtomArray } from '../array.js';
import { Stabilizer } from '../stabilizer.js';
import { StabilizedAtomArray } from './stabilized.js';
import { ORB } from 'metron-core/atom.js';
import { ARRAY_CHANGE_STORE } from './change-store.js';

export function createMappedArray<TIn, TOut>(
  source: AtomArray<TIn>,
  mapper: (value: TIn) => TOut
): AtomArray<TOut> {
  throw new Error('Not implemented!');

  const changeStore = source[ARRAY_CHANGE_STORE];
  const inner: TOut[] = [];
  const mappedItems = [];

  const stabilizer = new Stabilizer(() => {});

  const clearAndDestabilize = () => {
    inner.length = 0;
    mappedItems.length = 0;
    stabilizer.destabilize();
  };

  const orb = createRelayOrb(stabilizer, Stabilizer.intercept, [source[ORB]]);

  return new StabilizedAtomArray<TOut>(inner, stabilizer, orb, changeStore);
}
