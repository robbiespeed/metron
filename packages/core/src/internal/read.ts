import { type Atom, ORB } from '../atom.js';
import { type Orb, linkOrbs } from '../orb.js';
import { ExpiredReadContext } from '../shared.js';

export function bindableRead<T>(this: Orb<unknown>, atom: Atom<T>): T {
  linkOrbs(this, atom[ORB]);
  return atom.unwrap();
}

export function unexpectedRead(atom: Atom<unknown>): never {
  throw new Error('Unexpected read');
}

export function bindableEphemeralRead<T>(
  this: { receiver: Orb<unknown> },
  atom: Atom<T>
): T {
  const { receiver } = this;
  if (receiver === undefined) {
    throw new ExpiredReadContext();
  }

  linkOrbs(receiver, atom[ORB]);
  return atom.unwrap();
}
