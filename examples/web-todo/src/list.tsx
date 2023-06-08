import { createAtom } from '@metron/core/atom.js';
import { untracked } from '@metron/core/particle.js';

export function List() {
  const [items, setItems] = createAtom([
    <li>1</li>,
    <li>2</li>,
    <li>3</li>,
    <li>4</li>,
    <li>5</li>,
  ]);

  const reverseList = () => {
    setItems(untracked(items).slice().reverse());
  };

  return (
    <>
      <button type="button" on:click={reverseList}>
        Reverse
      </button>
      <ul>
        <li>0</li>
        {items}
      </ul>
    </>
  );
}
