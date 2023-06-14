import { Atom, createAtom } from '@metron/core/atom';
import { untracked } from '@metron/core/particle';
import { createAtomList } from '@metron/core/list';
import { Counter } from './counter';

interface Item {
  id: number;
  count: Atom<number>;
  setCount: (value: number) => void;
}

function ListItem({ item }: { item: Item }) {
  return (
    <li>
      {item.id}: <Counter count={item.count} setCount={item.setCount} />
    </li>
  );
}

export function List() {
  const [list, listWriter] = createAtomList<Item>(
    new Array(1_000).fill(0).map((_, i) => {
      const [count, setCount] = createAtom(0);
      return { id: i, count, setCount };
    })
  );

  const reverseList = () => {
    listWriter.reverse();
  };

  const sortListAscId = () => {
    listWriter.sort((a, b) => a.id - b.id);
  };
  const sortListDscId = () => {
    listWriter.sort((a, b) => b.id - a.id);
  };
  const sortListAscCount = () => {
    listWriter.sort((a, b) => untracked(a.count) - untracked(b.count));
  };
  const sortListDscCount = () => {
    listWriter.sort((a, b) => untracked(b.count) - untracked(a.count));
  };

  return (
    <>
      <button type="button" on:click={reverseList}>
        Reverse
      </button>
      <button type="button" on:click={sortListAscId}>
        Sort Id (asc)
      </button>
      <button type="button" on:click={sortListDscId}>
        Sort Id (dsc)
      </button>
      <button type="button" on:click={sortListAscCount}>
        Sort Count (asc)
      </button>
      <button type="button" on:click={sortListDscCount}>
        Sort Count (dsc)
      </button>
      <ul>
        <li>Start</li>
        {list.map((i) => (
          <ListItem item={i} />
        ))}
        <li>End</li>
      </ul>
    </>
  );
}
