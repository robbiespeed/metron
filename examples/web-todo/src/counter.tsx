import { createAtom } from '@metron/core/atom.js';
import { untracked } from '@metron/core/particle.js';

export function Counter() {
  const [count, setCount] = createAtom(0);

  return (
    <button
      type="button"
      onClick={() => {
        setCount(untracked(count) + 1);
      }}
    >
      count is {count}
    </button>
  );
}
