import { expect } from 'chai';
import { describe } from 'mocha';
import { createSensor } from './sensor';

describe('RawSensor', () => {
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
});
