import { type Atom, ORB } from '../atom.js';
import { type ReceiverOrb, linkOrbs } from '../orb.js';

export function bindableRead<T>(this: ReceiverOrb<any>, atom: Atom<T>): T {
  linkOrbs(this, atom[ORB]);
  return atom.unwrap();
}

export function unexpectedRead(atom: Atom<any>): never {
  throw new Error('Unexpected read');
}
