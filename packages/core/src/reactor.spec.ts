import { expect } from 'chai';
import { createReactor } from './reactor.js';
import { createSensor } from './sensor.js';
import { garbageCollect } from '@metron/test-utils';

describe('core: Reactor', () => {
  it('should create', () => {
    expect(createReactor(() => {})).to.exist;
  });
  it('should react', () => {
    const sensor = createSensor();
    let count = 0;
    createReactor(({ connect }) => {
      connect(sensor);
      count++;
    });
    sensor.send();
    expect(count).to.equal(2);
  });
  it('should react with a scheduler', async () => {
    const sensor = createSensor();
    let count = 0;
    createReactor(
      ({ connect }) => {
        connect(sensor);
        count++;
      },
      (callback) => setTimeout(callback, 0)
    );
    expect(count).to.equal(0);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(count).to.equal(1);
    sensor.send();
    expect(count).to.equal(1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(count).to.equal(2);
  });
  it('should terminate', () => {
    const sensor = createSensor();
    let count = 0;
    const clear = createReactor(({ connect }) => {
      connect(sensor);
      count++;
    });
    clear();
    sensor.send();
    expect(count).to.equal(1);
  });
  function createWeakReactorBox() {
    const sensor = createSensor();
    const box = { count: 0 };
    createReactor(({ connect }) => {
      connect(sensor);
      box.count++;
    });
    sensor.send();
    return [new WeakRef(sensor), new WeakRef(box)] as const;
  }
  it('should garbage collect when unreachable', async function () {
    if (!garbageCollect) {
      this.skip();
    }

    const [weakSensor, weakBox] = createWeakReactorBox();
    await garbageCollect();
    expect(weakSensor.deref()).to.be.undefined;
    expect(weakBox.deref()).to.be.undefined;
  });
});
