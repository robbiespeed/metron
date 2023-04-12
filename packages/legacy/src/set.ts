import { createSensor } from './sensor.js';
import type { EmitterCallback, Particle } from './types.js';

enum ChangeType {
  Add,
  Delete,
  Clear,
}

interface ChangeSingle<V> {
  type: ChangeType.Add | ChangeType.Delete;
  value: V;
}

interface ChangeAll<V> {
  type: ChangeType.Clear;
  values: Set<V>;
}

type Change<V> = ChangeSingle<V> | ChangeAll<V>;

export const ParticleSetChangeType = ChangeType;
export class ParticleSet<V> extends Set<V> implements Particle<Change<V>> {
  private _sensor = createSensor<Change<V>>();
  constructor(values?: V[]) {
    // We avoid passing values to super here because the original set
    // constructor would call the new add method for each entry
    super();

    if (values) {
      for (const value of values) {
        super.add(value);
      }
    }
  }
  watch(callback: EmitterCallback<Change<V>>) {
    return this._sensor.watch(callback);
  }
  override add(value: V) {
    if (this.has(value)) {
      return this;
    }

    super.add(value);

    this._sensor.send({ type: ChangeType.Add, value });

    return this;
  }
  override delete(value: V) {
    if (!this.has(value)) {
      return false;
    }

    super.delete(value);

    this._sensor.send({ type: ChangeType.Delete, value });

    return true;
  }
  override clear() {
    const values = new Set(this);
    super.clear();

    this._sensor.send({ type: ChangeType.Clear, values });
  }
}
