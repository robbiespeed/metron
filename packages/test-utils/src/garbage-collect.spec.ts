import { expect } from 'chai';
import { garbageCollect } from './garbage-collect';

describe('test-utils: garbageCollect', () => {
  it('should collect a unreachable object', async function () {
    if (!garbageCollect) {
      this.skip();
    }
    const weakRef = new WeakRef({});
    await garbageCollect();
    expect(weakRef.deref()).to.be.undefined;
  });
});
