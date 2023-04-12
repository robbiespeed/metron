import { createSensor } from './sensor.js';
import type { EmitterCallback, Particle } from './types.js';

enum ChangeType {
  Set,
  Delete,
  Clear,
}

interface ChangeSingle<K> {
  t: ChangeType.Set | ChangeType.Delete;
  k: K;
}

interface ChangeAll {
  t: ChangeType.Clear;
}

type Change<K> = ChangeSingle<K> | ChangeAll;

export class ParticleMap<K, V>
  extends Map<K, V>
  implements Particle<Change<K>>
{
  private _sensor = createSensor<Change<K>>();
  constructor(entries?: [K, V][]) {
    // We avoid passing entries to super here because the original map
    // constructor would call the new set method for each entry
    super();

    if (entries) {
      for (const [key, value] of entries) {
        super.set(key, value);
      }
    }
  }
  watch(callback: EmitterCallback<Change<K>>) {
    return this._sensor.watch(callback);
  }
  override set(key: K, value: V) {
    if (value === this.get(key)) {
      return this;
    }

    super.set(key, value);

    this._sensor.send({ t: ChangeType.Set, k: key });

    return this;
  }
  override delete(key: K) {
    if (!this.has(key)) {
      return false;
    }

    super.delete(key);

    this._sensor.send({ t: ChangeType.Delete, k: key });

    return true;
  }
  override clear() {
    super.clear();

    this._sensor.send({ t: ChangeType.Clear });
  }
}
