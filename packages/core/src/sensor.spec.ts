import { expect } from 'chai';
import { createSensor } from './sensor.js';
import { garbageCollect } from '@metron/test-utils';

describe('core: Sensor', () => {
  it('should create', () => {
    expect(createSensor()).to.exist;
  });
  it('should send and emit', () => {
    const sensor = createSensor();
    let count = 0;
    sensor.emitter(() => {
      count++;
    });
    sensor.send();
    expect(count).to.equal(1);
  });
  it('should send and emit multiple', () => {
    const sensor = createSensor();
    let countA = 0;
    let countB = 0;
    sensor.emitter(() => {
      countA++;
    });
    sensor.emitter(() => {
      countB++;
    });
    sensor.send();
    expect(countA).to.equal(1);
    expect(countB).to.equal(1);
  });
  it('should send data', () => {
    const sensor = createSensor<string>();
    let message = '';
    sensor.emitter((data) => {
      message = data;
    });
    sensor.send('Hello');
    expect(message).to.equal('Hello');
  });
  it('should terminate', () => {
    const sensor = createSensor();
    let count = 0;
    const clear = sensor.emitter(() => {
      count++;
    });
    clear();
    sensor.send();
    expect(count).to.equal(0);
  });

  function createActiveWeakSensor() {
    const sensor = createSensor();
    const box = { count: 0 };
    sensor.emitter(() => {
      box.count++;
    });
    sensor.send();
    return [new WeakRef(sensor), new WeakRef(box)] as const;
  }
  it('should garbage collect when unreachable', async function () {
    if (!garbageCollect) {
      this.skip();
    }

    const [weakSensor, weakBox] = createActiveWeakSensor();
    await garbageCollect();
    expect(weakSensor.deref()).to.be.undefined;
    expect(weakBox.deref()).to.be.undefined;
  });
});
