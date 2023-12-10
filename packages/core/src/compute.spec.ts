// import { expect } from 'chai';
// import { compute } from './compute.js';
// import { signalKey, untracked } from './particle.js';
// import { garbageCollect } from 'metron-test-utils';
// import { emptyCacheToken } from './cache.js';
// import { createAtom } from './atom.js';
// import { promiseMicroTask } from './schedulers.js';
// import { SignalNode } from './signal-node.js';

// describe('core: Compute', () => {
//   it('should create', () => {
//     expect(compute(() => {})).to.exist;
//   });
//   it('should compute', () => {
//     const computed = compute(() => 1);
//     expect(computed.cachedValue).to.equal(emptyCacheToken);
//     expect(untracked(computed)).to.equal(1);
//     expect(computed.cachedValue).to.equal(1);
//   });
//   it('should compute with connected sensor', async () => {
//     const signalNode = new SignalNode<void>(undefined);
//     signalNode.initAsSource();

//     const particle = {
//       [signalKey]: signalNode,
//     };
//     let count = 0;
//     const computed = compute(({ connect }) => {
//       connect(particle);
//       count++;
//       return count;
//     });
//     expect(computed.cachedValue).to.equal(emptyCacheToken);
//     expect(untracked(computed)).to.equal(1);
//     expect(computed.cachedValue).to.equal(1);
//     signalNode.update();
//     expect(untracked(computed)).to.equal(2);
//     expect(count).to.equal(2);
//   });
//   it('should compute with connected atoms', async () => {
//     const [aAtom, setA] = createAtom(0);
//     const [bAtom, setB] = createAtom(0);
//     let computeCount = 0;
//     const computed = compute(({ read }) => {
//       const a = read(aAtom),
//         b = read(bAtom);
//       computeCount++;
//       return a + b;
//     });
//     let emitCount = 0;
//     computed[signalKey].subscribe(() => emitCount++);
//     expect(emitCount).to.equal(0);
//     expect(computeCount).to.equal(0);
//     expect(computed.cachedValue).to.equal(emptyCacheToken);
//     expect(untracked(computed)).to.equal(0);
//     expect(computed.cachedValue).to.equal(0);
//     expect(emitCount).to.equal(0);
//     expect(computeCount).to.equal(1);
//     setA(2);
//     setA(1);
//     expect(untracked(computed)).to.equal(1);
//     setB(2);
//     expect(untracked(computed)).to.equal(3);
//     expect(emitCount).to.equal(2);
//     expect(computeCount).to.equal(3);
//     await promiseMicroTask();
//     expect(emitCount).to.equal(2);
//   });
//   it('should compute with chained computed', async () => {
//     const [aAtom, setA] = createAtom(0);
//     const [bAtom, setB] = createAtom(0);
//     let computeCountX = 0;
//     const computedX = compute(({ readAll }) => {
//       const [a, b] = readAll(aAtom, bAtom);
//       computeCountX++;
//       return a + b;
//     });
//     let immediateEmitCountX = 0;
//     computedX[signalKey].subscribe(() => immediateEmitCountX++);
//     let computeCountY = 0;
//     const computedY = compute(({ read }) => {
//       const x = read(computedX);
//       computeCountY++;
//       return x * 2;
//     });
//     let immediateEmitCountY = 0;
//     computedY[signalKey].subscribe(() => immediateEmitCountY++);
//     expect(computeCountX).to.equal(0);
//     expect(computeCountY).to.equal(0);
//     expect(computedX.cachedValue).to.equal(emptyCacheToken);
//     expect(computedY.cachedValue).to.equal(emptyCacheToken);
//     expect(untracked(computedX)).to.equal(0);
//     expect(untracked(computedY)).to.equal(0);
//     expect(computedX.cachedValue).to.equal(0);
//     expect(computedY.cachedValue).to.equal(0);
//     expect(computeCountX).to.equal(1);
//     expect(computeCountY).to.equal(1);
//     setA(2);
//     setA(1);
//     expect(immediateEmitCountX).to.equal(1);
//     expect(immediateEmitCountY).to.equal(1);
//     expect(untracked(computedX)).to.equal(1);
//     expect(untracked(computedY)).to.equal(2);
//     setB(2);
//     expect(immediateEmitCountX).to.equal(2);
//     expect(immediateEmitCountY).to.equal(2);
//     expect(untracked(computedX)).to.equal(3);
//     expect(untracked(computedY)).to.equal(6);
//     expect(computeCountX).to.equal(3);
//     expect(computeCountY).to.equal(3);
//     await promiseMicroTask();
//     expect(immediateEmitCountX).to.equal(2);
//     expect(immediateEmitCountY).to.equal(2);
//   });
//   function createWeakComputed() {
//     const signalNode = new SignalNode<void>(undefined);
//     signalNode.initAsSource();

//     const mockParticle = {
//       [signalKey]: signalNode,
//     };
//     let computeCount = 0;
//     const computed = compute(({ connect }) => {
//       connect(mockParticle);
//       computeCount++;
//       return computeCount;
//     });
//     untracked(computed);
//     return [
//       mockParticle,
//       new WeakRef(computed),
//       new WeakRef(computed[signalKey]),
//     ] as const;
//   }
//   it('should cleanup sensor when garbage collected', async function () {
//     if (!garbageCollect) {
//       this.skip();
//     }
//     const [mockParticle, computedRef, compEmitterRef] = createWeakComputed();
//     await garbageCollect();
//     expect(mockParticle).to.exist;
//     expect(computedRef.deref()).to.equal(undefined);
//     await garbageCollect();
//     expect(compEmitterRef.deref()).to.equal(undefined);
//   });
// });
