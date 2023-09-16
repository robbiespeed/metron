// import { expect } from 'chai';
// import { garbageCollect } from 'metron-test-utils';
// import { Emitter } from './emitter.js';

// describe('core: Emitter', () => {
//   it('should create', () => {
//     expect(new Emitter()).to.exist;
//   });
//   it('should update and run update handler', () => {
//     let count = 0;
//     const { update } = Emitter.withUpdater(() => {
//       count++;
//     });
//     update();
//     expect(count).to.equal(1);
//   });
//   it('should update and emit multiple', () => {
//     const { emitter, update } = Emitter.withUpdater();
//     let countA = 0;
//     let countB = 0;
//     emitter.subscribe(() => {
//       countA++;
//     });
//     emitter.subscribe(() => {
//       countB++;
//     });
//     update();
//     expect(countA).to.equal(1);
//     expect(countB).to.equal(1);
//   });
//   it('should send data', () => {
//     const { emitter, update } = Emitter.withUpdater<string>();
//     let message = '';
//     emitter.subscribe((data) => {
//       message = data;
//     });
//     update('Hello');
//     expect(message).to.equal('Hello');
//     update('World');
//     expect(message).to.equal('World');
//   });
//   it('should terminate', () => {
//     const { emitter, update } = Emitter.withUpdater();
//     let count = 0;
//     const clear = emitter.subscribe(() => {
//       count++;
//     });
//     update();
//     expect(count).to.equal(1);
//     clear();
//     update();
//     expect(count).to.equal(1);
//   });

//   function createActiveWeakSensor() {
//     const { emitter, update } = Emitter.withUpdater(() => {
//       box.count++;
//     });
//     const box = { count: 0 };
//     update();
//     return [
//       new WeakRef(emitter),
//       new WeakRef(update),
//       new WeakRef(box),
//     ] as const;
//   }
//   it('should garbage collect when unreachable', async function () {
//     if (!garbageCollect) {
//       this.skip();
//     }

//     const [weakEmitter, weakSend, weakBox] = createActiveWeakSensor();
//     await garbageCollect();
//     expect(weakEmitter.deref()).to.be.undefined;
//     expect(weakSend.deref()).to.be.undefined;
//     expect(weakBox.deref()).to.be.undefined;
//   });
// });
