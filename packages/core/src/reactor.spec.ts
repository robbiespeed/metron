import { expect } from 'chai';
import { createReactor } from './reactor.js';
import { garbageCollect } from 'metron-test-utils';
import { createEmitter } from './emitter.js';

describe('core: Reactor', () => {
  it('should create', () => {
    expect(createReactor(() => {})).to.exist;
  });
  it('should react', () => {
    const [emitter, send] = createEmitter();
    let count = 0;
    createReactor(({ connect }) => {
      connect(emitter);
      count++;
    });
    send();
    expect(count).to.equal(2);
  });
  it('should react with a scheduler', async () => {
    const [emitter, send] = createEmitter();
    let count = 0;
    createReactor(
      ({ connect }) => {
        connect(emitter);
        count++;
      },
      (callback) => setTimeout(callback, 0)
    );
    expect(count).to.equal(0);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(count).to.equal(1);
    send();
    expect(count).to.equal(1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(count).to.equal(2);
  });
  it('should terminate', () => {
    const [emitter, send] = createEmitter();
    let count = 0;
    const clear = createReactor(({ connect }) => {
      connect(emitter);
      count++;
    });
    clear();
    send();
    expect(count).to.equal(1);
  });
  function createWeakReactorBox() {
    const [emitter, send] = createEmitter();
    const box = { count: 0 };
    createReactor(({ connect }) => {
      connect(emitter);
      box.count++;
    });
    send();
    return [new WeakRef(emitter), new WeakRef(send), new WeakRef(box)] as const;
  }
  it('should garbage collect when unreachable', async function () {
    if (!garbageCollect) {
      this.skip();
    }

    const [weakEmitter, weakSend, weakBox] = createWeakReactorBox();
    await garbageCollect();
    expect(weakEmitter.deref()).to.be.undefined;
    expect(weakSend.deref()).to.be.undefined;
    expect(weakBox.deref()).to.be.undefined;
  });
});
