import { createAtom } from '@metron/core/atom.js';
import { untracked } from '@metron/core/particle.js';
import { Counter } from './counter';

export function List() {
  const [items, setItems] = createAtom(
    new Array(30_000).fill(0).map((_, i) => (
      <li>
        {i}: <Counter />
      </li>
    ))
  );

  const reverseList = () => {
    setItems(untracked(items).slice().reverse());
  };

  return (
    <>
      <button type="button" on:click={reverseList}>
        Reverse
      </button>
      <ul>
        <li>Start</li>
        {items}
        <li>End</li>
      </ul>
    </>
  );
}
