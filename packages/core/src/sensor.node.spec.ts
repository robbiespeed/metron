import { expect } from 'chai';
import { describe } from 'mocha';
import { createSensor } from './sensor';

const garbageCollect =
  global.gc &&
  (async () => {
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 0));
    global.gc!();
  });

describe('Sensor - Garbage Collection', () => {
  function createActiveWeakSensor() {
    const sensor = createSensor();
    const box = { count: 0 };
    sensor.emitter(() => {
      box.count++;
    });
    sensor.send();
    return new WeakRef(sensor);
  }
  it('should collect active unreachable sensor', async function () {
    if (!garbageCollect) {
      this.skip();
    }

    const weakSensor = createActiveWeakSensor();
    await garbageCollect();
    expect(weakSensor.deref()).to.be.undefined;
  });
});
