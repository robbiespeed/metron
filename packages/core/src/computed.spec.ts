import { expect } from 'chai';
import { createComputed } from './computed.js';
import { createSensor } from './sensor.js';
import { emitterKey, untracked } from './particle.js';
import type { Emitter, EmitHandler } from './emitter.js';
import { garbageCollect } from '@metron/test-utils';

describe('core: Computed', () => {
  it('should create', () => {
    expect(createComputed(() => {})).to.exist;
  });
  it('should compute', () => {
    const computed = createComputed(() => 1);
    expect(computed.cachedValue).to.equal(undefined);
    expect(computed.isCacheValid).to.equal(false);
    expect(untracked(computed)).to.equal(1);
    expect(computed.cachedValue).to.equal(1);
    expect(computed.isCacheValid).to.equal(true);
  });
  it('should compute with a connected sensor', () => {
    const sensor = createSensor();
    let count = 0;
    const computed = createComputed(({ connect }) => {
      connect(sensor);
      count++;
      return count;
    });
    expect(computed.cachedValue).to.equal(undefined);
    expect(computed.isCacheValid).to.equal(false);
    expect(untracked(computed)).to.equal(1);
    expect(computed.cachedValue).to.equal(1);
    expect(computed.isCacheValid).to.equal(true);
    sensor.send();
    expect(computed.isCacheValid).to.equal(false);
    expect(untracked(computed)).to.equal(2);
    expect(computed.isCacheValid).to.equal(true);
  });
  function createWeakComputed() {
    let subCount = 0;
    let emitterCallback: EmitHandler<undefined> | undefined;
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
    const computed = createComputed(({ connect }) => {
      connect(mockSensor);
      computeCount++;
      return computeCount;
    });
    untracked(computed);
    return [mockSensor, new WeakRef(computed)] as const;
  }
  it('should cleanup sensor when garbage collected', async function () {
    if (!garbageCollect) {
      this.skip();
    }
    const [mockSensor, computedRef] = createWeakComputed();
    await garbageCollect();
    expect(mockSensor.checkEmitterSubCount()).to.equal(1);
    expect(computedRef.deref()).to.equal(undefined);
    // spawn a microtask to allow the sensor to be cleaned up
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockSensor.checkEmitterCallbackIsCleared()).to.equal(true);
  });
});
