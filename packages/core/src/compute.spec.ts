import { expect } from 'chai';
import { compute } from './compute.js';
import { emitterKey, untracked } from './particle.js';
import { type Emitter, type EmitHandler, createEmitter } from './emitter.js';
import { garbageCollect } from 'metron-test-utils';
import { emptyCacheToken } from './cache.js';
import { createAtom } from './atom.js';
import { promiseMicroTask } from './schedulers.js';

describe('core: Compute', () => {
  it('should create', () => {
    expect(compute(() => {})).to.exist;
  });
  it('should compute', () => {
    const computed = compute(() => 1);
    expect(computed.cachedValue).to.equal(emptyCacheToken);
    expect(untracked(computed)).to.equal(1);
    expect(computed.cachedValue).to.equal(1);
  });
  it('should compute with connected sensor', async () => {
    const [emitter, send] = createEmitter();
    let count = 0;
    const computed = compute(({ connect }) => {
      connect(emitter);
      count++;
      return count;
    });
    expect(computed.cachedValue).to.equal(emptyCacheToken);
    expect(untracked(computed)).to.equal(1);
    expect(computed.cachedValue).to.equal(1);
    send();
    expect(untracked(computed)).to.equal(2);
    expect(count).to.equal(2);
  });
  it('should compute with connected atoms', async () => {
    const [aAtom, setA] = createAtom(0);
    const [bAtom, setB] = createAtom(0);
    let computeCount = 0;
    const computed = compute(({ read }) => {
      const a = read(aAtom),
        b = read(bAtom);
      computeCount++;
      return a + b;
    });
    let emitCount = 0;
    computed[emitterKey](() => emitCount++);
    expect(emitCount).to.equal(0);
    expect(computeCount).to.equal(0);
    expect(computed.cachedValue).to.equal(emptyCacheToken);
    expect(untracked(computed)).to.equal(0);
    expect(computed.cachedValue).to.equal(0);
    expect(emitCount).to.equal(0);
    expect(computeCount).to.equal(1);
    setA(2);
    setA(1);
    expect(untracked(computed)).to.equal(1);
    setB(2);
    expect(untracked(computed)).to.equal(3);
    expect(emitCount).to.equal(2);
    expect(computeCount).to.equal(3);
    await promiseMicroTask();
    expect(emitCount).to.equal(2);
  });
  it('should compute with chained computed', async () => {
    const [aAtom, setA] = createAtom(0);
    const [bAtom, setB] = createAtom(0);
    let computeCountX = 0;
    const computedX = compute(({ readAll }) => {
      const [a, b] = readAll(aAtom, bAtom);
      computeCountX++;
      return a + b;
    });
    let immediateEmitCountX = 0;
    computedX[emitterKey](() => immediateEmitCountX++);
    let computeCountY = 0;
    const computedY = compute(({ read }) => {
      const x = read(computedX);
      computeCountY++;
      return x * 2;
    });
    let immediateEmitCountY = 0;
    computedY[emitterKey](() => immediateEmitCountY++);
    expect(computeCountX).to.equal(0);
    expect(computeCountY).to.equal(0);
    expect(computedX.cachedValue).to.equal(emptyCacheToken);
    expect(computedY.cachedValue).to.equal(emptyCacheToken);
    expect(untracked(computedX)).to.equal(0);
    expect(untracked(computedY)).to.equal(0);
    expect(computedX.cachedValue).to.equal(0);
    expect(computedY.cachedValue).to.equal(0);
    expect(computeCountX).to.equal(1);
    expect(computeCountY).to.equal(1);
    setA(2);
    setA(1);
    expect(immediateEmitCountX).to.equal(1);
    expect(immediateEmitCountY).to.equal(1);
    expect(untracked(computedX)).to.equal(1);
    expect(untracked(computedY)).to.equal(2);
    setB(2);
    expect(immediateEmitCountX).to.equal(2);
    expect(immediateEmitCountY).to.equal(2);
    expect(untracked(computedX)).to.equal(3);
    expect(untracked(computedY)).to.equal(6);
    expect(computeCountX).to.equal(3);
    expect(computeCountY).to.equal(3);
    await promiseMicroTask();
    expect(immediateEmitCountX).to.equal(2);
    expect(immediateEmitCountY).to.equal(2);
  });
  function createWeakComputed() {
    let subCount = 0;
    let emitterCallback: EmitHandler<undefined> | undefined;
    const emitter = ((cb) => {
      subCount++;
      emitterCallback = cb;
      return () => {
        emitterCallback = undefined;
      };
    }) as Emitter<undefined>;
    (emitter as any)[emitterKey] = emitter;
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
    const computed = compute(({ connect }) => {
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
    expect(mockSensor.checkEmitterCallbackIsCleared()).to.equal(true);
  });
});
