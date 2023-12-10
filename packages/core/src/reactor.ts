import { ORB, type Atom } from './atom.js';
import { createReceiverOrb, type Orb } from './orb.js';
import { emptyFn } from './shared.js';

interface ReactorScheduler {
  (reactor: Reactor<any>): void;
}

interface Reactor<TValue> {
  canSchedule: boolean;
  reaction: (source: Atom<TValue>) => void;
  scheduler: ReactorScheduler;
  source: Atom<TValue>;
}

function reactorIntercept(this: Orb<Reactor<any> | undefined>) {
  const { data } = this;
  if (data?.canSchedule) {
    data.canSchedule = false;
    data.scheduler(data);
  }
  return false;
}

export function createReaction<TValue>(
  source: Atom<TValue>,
  reaction: (source: Atom<TValue>) => void,
  scheduler: ReactorScheduler
) {
  let orb: Orb<Reactor<TValue> | undefined> | undefined = createReceiverOrb(
    {
      canSchedule: false,
      reaction,
      scheduler,
      source,
    },
    reactorIntercept,
    [source[ORB]]
  );

  return () => {
    if (orb === undefined) {
      return;
    }
    orb.data!.reaction = emptyFn;
    orb.data = undefined;
    orb = undefined;
  };
}
