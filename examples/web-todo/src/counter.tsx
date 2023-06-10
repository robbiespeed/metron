import { createAtom } from '@metron/core/atom.js';
import { Atom, untracked } from '@metron/core/particle.js';

export function Counter({
  count,
  setCount,
}:
  | { count: Atom<number>; setCount: (value: number) => void }
  | { count?: undefined; setCount?: undefined }) {
  if (count === undefined || setCount === undefined) {
    [count, setCount] = createAtom(0);
  }

  return (
    <button
      type="button"
      on:click={() => {
        // TODO: untracked is very verbose, what about count.$, count.v, or $(count)?
        setCount!(untracked(count!) + 1);
      }}
    >
      count is {count}
    </button>
  );
}
