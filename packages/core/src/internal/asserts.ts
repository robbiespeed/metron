import { ExpiredReadContext } from '../shared.js';

export function bindableAssertActive(this: { receiver: unknown }) {
  if (this.receiver === undefined) {
    throw new ExpiredReadContext();
  }
}
