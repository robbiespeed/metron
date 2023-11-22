import { type Atom, ORB } from './atom.js';
import { type ReceiverOrb, linkOrbs } from './orb.js';

export function bindableRead<T>(this: ReceiverOrb<any>, atom: Atom<T>): T {
  linkOrbs(this, atom[ORB]);
  return atom.unwrap();
}

export function unexpectedRead(atom: Atom<any>): never {
  throw new Error('Unexpected read');
}

// TODO: Maybe don't need what's below? So long as subscribers are smart and schedule
// a microtask for things that don't need to be immediate

// const scheduledEmits: {
//   emit: (msg: any) => any;
//   message: EmitMessageOption;
// }[] = [];

// const addScheduledEmit = scheduledEmits.push.bind(scheduledEmits);

// let canScheduleEmitRun = true;

// export function bindableScheduleEmit<TEmit extends EmitMessageOption>(
//   this: (message: TEmit) => void,
//   message: TEmit
// ) {
//   addScheduledEmit({ emit: this, message });
//   if (canScheduleEmitRun) {
//     canScheduleEmitRun = false;
//     queueAfterOrbTransmit(runScheduledEmits);
//   }
// }

// function runScheduledEmits() {
//   for (let i = 0; i < scheduledEmits.length; i++) {
//     const { emit, message } = scheduledEmits[i]!;
//     emit(message);
//   }
//   scheduledEmits.length = 0;
//   canScheduleEmitRun = true;
// }
