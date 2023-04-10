import { expect } from 'chai';
import { describe } from 'mocha';
import { createSensor } from './sensor';

/**
 * Only available in node if `--expose-gc` is passed to the process.
 */
declare const global: { gc?(): void };

const garbageCollect =
  global.gc &&
  (async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    global.gc!();
  });

describe('Sensor', () => {
  it('should create', () => {
    expect(createSensor()).to.exist;
  });
  it('should send', () => {
    const sensor = createSensor();
    let count = 0;
    sensor.emitter(() => {
      count++;
    });
    sensor.send();
    expect(count).to.equal(1);
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
  if (garbageCollect) {
    function createActiveWeakSensor() {
      const sensor = createSensor();
      let count = 0;
      const clear = sensor.emitter(() => {
        count++;
      });
      sensor.send();
      // clear();
      return new WeakRef(sensor);
    }
    it('should garbage collect', async () => {
      const weakSensor = createActiveWeakSensor();
      await garbageCollect();
      expect(weakSensor.deref()).to.be.undefined;
    });
  } else {
    it('should garbage collect');
  }
});
