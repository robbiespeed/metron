import { expect } from 'chai';
import { createReactor } from './reactor';
import { createSensor } from './sensor';

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
});
