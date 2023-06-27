import { expect } from 'chai';
import { garbageCollect } from 'metron-test-utils';
import { createEmitter } from './emitter.js';

describe('core: Emitter', () => {
  it('should create', () => {
    expect(createEmitter()).to.have.lengthOf(2);
  });
  it('should send and emit', () => {
    const [emitter, send] = createEmitter();
    let count = 0;
    emitter(() => {
      count++;
    });
    send();
    expect(count).to.equal(1);
  });
  it('should send and emit multiple', () => {
    const [emitter, send] = createEmitter();
    let countA = 0;
    let countB = 0;
    emitter(() => {
      countA++;
    });
    emitter(() => {
      countB++;
    });
    send();
    expect(countA).to.equal(1);
    expect(countB).to.equal(1);
  });
  it('should send data', () => {
    const [emitter, send] = createEmitter<string>();
    let message = '';
    emitter((data) => {
      message = data;
    });
    send('Hello');
    expect(message).to.equal('Hello');
  });
  it('should terminate', () => {
    const [emitter, send] = createEmitter();
    let count = 0;
    const clear = emitter(() => {
      count++;
    });
    clear();
    send();
    expect(count).to.equal(0);
  });

  function createActiveWeakSensor() {
    const [emitter, send] = createEmitter();
    const box = { count: 0 };
    emitter(() => {
      box.count++;
    });
    send();
    return [new WeakRef(emitter), new WeakRef(send), new WeakRef(box)] as const;
  }
  it('should garbage collect when unreachable', async function () {
    if (!garbageCollect) {
      this.skip();
    }

    const [weakEmitter, weakSend, weakBox] = createActiveWeakSensor();
    await garbageCollect();
    expect(weakEmitter.deref()).to.be.undefined;
    expect(weakSend.deref()).to.be.undefined;
    expect(weakBox.deref()).to.be.undefined;
  });
});
