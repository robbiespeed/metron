import { expect } from 'chai';
import { derive } from './derive.js';
import { emitterKey, untracked } from './particle.js';
import { Emitter, type EmitHandler } from './emitter.js';
import { garbageCollect } from 'metron-test-utils';
import { emptyCacheToken } from './cache.js';
import { createAtom } from './atom.js';
import { promiseMicroTask } from './schedulers.js';

describe('core: Derive', () => {
  it('should create', () => {
    expect(derive([], () => {})).to.exist;
  });
  it('should derive', () => {
    const derived = derive([], () => 1);
    expect(derived.cachedValue).to.equal(emptyCacheToken);
    expect(untracked(derived)).to.equal(1);
    expect(derived.cachedValue).to.equal(1);
  });
  it('should derive with connected sensor', () => {
    const { emitter, update } = Emitter.withUpdater();
    let count = 0;
    const derived = derive([emitter], () => {
      count++;
      return count;
    });
    expect(derived.cachedValue).to.equal(emptyCacheToken);
    expect(untracked(derived)).to.equal(1);
    expect(derived.cachedValue).to.equal(1);
    update();
    expect(untracked(derived)).to.equal(2);
  });
  it('should derive with connected atoms', async () => {
    const [aAtom, setA] = createAtom(0);
    const [bAtom, setB] = createAtom(0);
    let computeCount = 0;
    const derived = derive([aAtom, bAtom], (a, b) => {
      computeCount++;
      return a + b;
    });
    let emitCount = 0;
    derived[emitterKey].subscribe(() => emitCount++);
    expect(emitCount).to.equal(0);
    expect(computeCount).to.equal(0);
    expect(derived.cachedValue).to.equal(emptyCacheToken);
    expect(untracked(derived)).to.equal(0);
    expect(derived.cachedValue).to.equal(0);
    expect(emitCount).to.equal(0);
    expect(computeCount).to.equal(1);
    setA(2);
    setA(1);
    expect(untracked(derived)).to.equal(1);
    setB(2);
    expect(untracked(derived)).to.equal(3);
    expect(emitCount).to.equal(2);
    expect(computeCount).to.equal(3);
    await promiseMicroTask();
    expect(emitCount).to.equal(2);
  });
  it('should derive with chained derived', async () => {
    const [aAtom, setA] = createAtom(0);
    const [bAtom, setB] = createAtom(0);
    let computeCountX = 0;
    const derivedX = derive([aAtom, bAtom], (a, b) => {
      computeCountX++;
      return a + b;
    });
    let immediateEmitCountX = 0;
    derivedX[emitterKey].subscribe(() => immediateEmitCountX++);
    let computeCountY = 0;
    const derivedY = derive([derivedX], (x) => {
      computeCountY++;
      return x * 2;
    });
    let immediateEmitCountY = 0;
    derivedY[emitterKey].subscribe(() => immediateEmitCountY++);
    expect(computeCountX).to.equal(0);
    expect(computeCountY).to.equal(0);
    expect(derivedX.cachedValue).to.equal(emptyCacheToken);
    expect(derivedY.cachedValue).to.equal(emptyCacheToken);
    expect(untracked(derivedX)).to.equal(0);
    expect(untracked(derivedY)).to.equal(0);
    expect(derivedX.cachedValue).to.equal(0);
    expect(derivedY.cachedValue).to.equal(0);
    expect(computeCountX).to.equal(1);
    expect(computeCountY).to.equal(1);
    setA(2);
    setA(1);
    expect(immediateEmitCountX).to.equal(1);
    expect(immediateEmitCountY).to.equal(1);
    expect(untracked(derivedX)).to.equal(1);
    expect(untracked(derivedY)).to.equal(2);
    setB(2);
    expect(immediateEmitCountX).to.equal(2);
    expect(immediateEmitCountY).to.equal(2);
    expect(untracked(derivedX)).to.equal(3);
    expect(untracked(derivedY)).to.equal(6);
    expect(computeCountX).to.equal(3);
    expect(computeCountY).to.equal(3);
    await promiseMicroTask();
    expect(immediateEmitCountX).to.equal(2);
    expect(immediateEmitCountY).to.equal(2);
  });
  function createWeakDerived() {
    const { emitter, update } = Emitter.withUpdater<void>();

    const mockParticle = {
      update,
      emitter,
      [emitterKey]: emitter,
    };
    let computeCount = 0;
    const derived = derive([mockParticle], () => {
      computeCount++;
      return computeCount;
    });
    untracked(derived);
    return [
      mockParticle,
      new WeakRef(derived),
      new WeakRef(derived[emitterKey]),
    ] as const;
  }
  it('should cleanup sensor when garbage collected', async function () {
    if (!garbageCollect) {
      this.skip();
    }
    const [mockParticle, derivedRef, derEmitterRef] = createWeakDerived();
    await garbageCollect();
    expect(mockParticle).to.exist;
    expect(derivedRef.deref()).to.equal(undefined);
    await garbageCollect();
    expect(derEmitterRef.deref()).to.equal(undefined);
  });
});
