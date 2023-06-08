import { createAtom } from '@metron/core/atom.js';
import { untracked } from '@metron/core/particle.js';

export function Counter() {
  const [count, setCount] = createAtom(0);

  return (
    <button
      type="button"
      on:click={() => {
        // TODO: untracked is very verbose, what about count.$, count.v, or $(count)?
        setCount(untracked(count) + 1);
      }}
    >
      count is {count}
    </button>
  );
}
