import { Atom, createAtom, createMutatorAtom } from 'metron-core/atom.js';
import { untracked } from 'metron-core/particle.js';
import { createAtomList } from 'metron-core/list.js';

interface Item {
  text: Atom<string>;
  setText: (value: string) => void;
  createdAt: number;
  priority: Atom<number>;
  increasePriority: () => void;
  decreasePriority: () => void;
}

function ListItem({
  item,
  removeItem,
}: {
  item: Item;
  removeItem: () => void;
}) {
  return (
    <tr>
      <td>
        <input
          type="text"
          on:change={(evt: any) => item.setText(evt.target.value)}
          value={item.text}
        />
      </td>
      <td>
        <button on:click={item.increasePriority}>{item.priority} +</button>
        <button on:click={item.decreasePriority}>-</button>
      </td>
      <td>
        <button on:click={removeItem}>Remove</button>
      </td>
    </tr>
  );
}

function createItem(): Item {
  const [priority, updatePriority] = createMutatorAtom(0);
  const [text, setText] = createAtom('');
  return {
    createdAt: Date.now(),
    priority,
    text,
    setText,
    increasePriority() {
      updatePriority((oldPri) => oldPri + 1);
    },
    decreasePriority() {
      updatePriority((oldPri) => oldPri - 1);
    },
  };
}

export function TodoList() {
  const [list, listWriter] = createAtomList<Item>([createItem()]);

  const sortListAscCreated = () => {
    listWriter.sort((a, b) => a.createdAt - b.createdAt);
  };
  const sortListDscCreated = () => {
    listWriter.sort((a, b) => b.createdAt - a.createdAt);
  };
  const sortListAscPriority = () => {
    listWriter.sort((a, b) => untracked(a.priority) - untracked(b.priority));
  };
  const sortListDscPriority = () => {
    listWriter.sort((a, b) => untracked(b.priority) - untracked(a.priority));
  };

  const addTodo = () => {
    listWriter.push(createItem());
  };

  const rawList = untracked(list);

  const removeTodo = (itemToRemove: Item) => {
    let idx = -1;
    let i = 0;
    for (const item of rawList) {
      if (item === itemToRemove) {
        idx = i;
        break;
      }
      i++;
    }
    if (idx >= 0) {
      listWriter.delete(idx);
    }
  };

  return (
    <>
      <div class="card">
        <span>Sort By:</span>
        <button type="button" on:click={sortListAscCreated}>
          Created (asc)
        </button>
        <button type="button" on:click={sortListDscCreated}>
          Created (dsc)
        </button>
        <button type="button" on:click={sortListAscPriority}>
          Priority (asc)
        </button>
        <button type="button" on:click={sortListDscPriority}>
          Priority (dsc)
        </button>
      </div>
      <table class="card">
        <thead>
          <tr>
            <th>Description</th>
            <th>Priority</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {list.map((item) => (
            <ListItem item={item} removeItem={() => removeTodo(item)} />
          ))}
        </tbody>
      </table>
      <div class="card">
        <button type="button" on:click={addTodo}>
          Add Todo
        </button>
      </div>
    </>
  );
}
