import { expect } from 'chai';
import { describe } from 'mocha';
import { createSensor } from './sensor';

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
});
