import { expect } from 'chai';
import { createDerived } from './derived.js';
import { createSensor } from './sensor.js';
import { emitterKey } from './particle.js';
import type { Emitter, EmitterCallback } from './emitter.js';
import { garbageCollect } from '@metron/test-utils';

describe('core: Derived', () => {
  it('should create', () => {
    expect(createDerived([], () => {})).to.exist;
  });
  it('should derive', () => {
    const derived = createDerived([], () => 1);
    expect(derived.cachedValue).to.equal(undefined);
    expect(derived.isCacheValid).to.equal(false);
    expect(derived.untracked).to.equal(1);
    expect(derived.cachedValue).to.equal(1);
    expect(derived.isCacheValid).to.equal(true);
  });
  it('should derive with a connected sensor', () => {
    const sensor = createSensor();
    let count = 0;
    const derived = createDerived([sensor], () => {
      count++;
      return count;
    });
    expect(derived.cachedValue).to.equal(undefined);
    expect(derived.isCacheValid).to.equal(false);
    expect(derived.untracked).to.equal(1);
    expect(derived.cachedValue).to.equal(1);
    expect(derived.isCacheValid).to.equal(true);
    sensor.send();
    expect(derived.isCacheValid).to.equal(false);
    expect(derived.untracked).to.equal(2);
    expect(derived.isCacheValid).to.equal(true);
  });
  function createWeakDerived() {
    let subCount = 0;
    let emitterCallback: EmitterCallback<undefined> | undefined;
    const emitter: Emitter<undefined> = (cb) => {
      subCount++;
      emitterCallback = cb;
      return () => {
        emitterCallback = undefined;
      };
    };
    const send = () => {
      emitterCallback?.(undefined);
    };
    const mockSensor = {
      send,
      emitter,
      checkEmitterCallbackIsCleared: () => emitterCallback === undefined,
      checkEmitterSubCount: () => subCount,
      [emitterKey]: emitter,
    };
    let computeCount = 0;
    const derived = createDerived([mockSensor], () => {
      computeCount++;
      return computeCount;
    });
    derived.untracked;
    return [mockSensor, new WeakRef(derived)] as const;
  }
  it('should cleanup sensor when garbage collected', async function () {
    if (!garbageCollect) {
      this.skip();
    }
    const [mockSensor, derivedRef] = createWeakDerived();
    await garbageCollect();
    expect(mockSensor.checkEmitterSubCount()).to.equal(1);
    expect(derivedRef.deref()).to.equal(undefined);
    // spawn a microtask to allow the sensor to be cleaned up
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockSensor.checkEmitterCallbackIsCleared()).to.equal(true);
  });
});
