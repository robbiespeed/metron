# Metron Core

This library contains multiple observable state structures. Writeable data is designed to have a separate writer returned along with the reader. This allows passing of the reader downstream without worry that it may mysteriously modify the state.

## Atom

The simplest structure can be set.

```ts
import { createAtom, subscribe, untracked } from 'metron-core';

const [text, setText] = createAtom('');

// subscribe will run the handler whenever text changes
// untracked gets the inner value of text
subscribe(text, () => console.log(untracked(text)));

setText('hello world');
// log: "hello world"
```

## Mutator Atom

Identical to an atom, but with a different style writer that accepts a updater function with the first argument of the previous value.

```ts
import { createMutatorAtom } from 'metron-core';

const [count, updateCount] = createMutatorAtom(0);

updateCount((value) => value + 1);
```

The same can be accomplished with a regular atom and the use of untracked:

```ts
import { createAtom } from 'metron-core';

const [count, setCount] = createAtom(0);

setCount(untracked(count) + 1);
```

## Subscribing to changes

Above we used `subscribe` to watch for changes on a atom, one thing to remember is subscribe returns a disposer function. If you want to stop a subscription run the disposer.

```ts
const dispose = subscribe(text, () => console.log(untracked(text)));
dispose();
```

## Computed

Computed atoms allow computing a atom from any number of other atoms.

```ts
import { createAtom, compute, untracked } from 'metron-core';

const [xAtom, setX] = createAtom(1);
const [yAtom, setY] = createAtom(2);

const computed = compute(({ get }) => {
  const [x, y] = get(xAtom, yAtom);
  return x * y;
});

untracked(computed); // 2
setX(-1);
untracked(computed); // -2
```

The get method provided in the arguments to the compute handler, tells the computed atom what to subscribe to. The atoms subscribed to do not need to be static each run, you can have it dynamically subscribe ex:

```ts
const computed = compute(({ get }) => {
  const [x] = get(xAtom);
  if (x < 0) {
    return x;
  }
  const [y] = get(yAtom);
  return x * y;
});
```

One thing to note about computeds is they do not emit immediately and instead the emit gets scheduled as a micro task:

```ts
subscribe(computed, () => console.log(untracked(computed)));
setX(-1);
// No log

// After next micro task
// log: -1
```

The reason for this is to avoid computed atoms from emitting multiple times in scenarios where multiple dependencies are updated in the same task:

```ts
subscribe(computed, () => console.log(untracked(computed)));
setX(2);
setY(3);
// No log

// After next micro task
// log: 6 (only once)
```

_Computeds and derived (more on them next) atoms do have an internal emitter that emits immediately which is used to invalidate the cache of any derived or computed that depend on the original._

## Derived

Derived atoms are very similar to computeds, with the difference that their dependencies are static and declared at creation.

```ts
import { createAtom, derive, untracked } from 'metron-core';

const [xAtom, setX] = createAtom(1);
const [yAtom, setY] = createAtom(2);

const derived = derive([xAtom.yAtom], (x, y) => x * y);

untracked(derived); // 2
setX(4);
untracked(derived); // 8
```

## List

Atom lists are like observable arrays, which emit special change messages for what operations where performed on the list. There are 3 structures to a list, the list atom itself, list writer, and raw list.

```ts
import { createAtomList, untracked, subscribe } from 'metron-core';

const [personList, personListWriter] = createAtomList<{ name: string }>();

// The raw list will still reflect changes made, and can be used very much like a normal array.
const rawPersonList = untracked(personList);

// List change messages all have a type and a size, some messages have more details depending on the type.
subscribe(personList, (message) =>
  console.log(`type: ${message.type}, size: ${message.size}`)
);

personListWriter.push({ name: 'bob' });
// log: "type: CollectionKeyAdd, size: 1"
personListWriter.append([{ name: 'alice' }, { name: 'sam' }]);
// log: "type: ListAppend, size: 3"
personListWriter.swap(0, 1);
// log: "type: CollectionKeySwap, size: 3"
rawPersonList.at(0); // { name: 'alice' }
```

Lists can also be mapped, the map callback is a little different than for array. There is no access to index, that is because the index may change if the original list is modified, but the value will not be recomputed for any existing items in the array.

```ts
// nameList is a new atom with a new rawList inside with cached values for each mapped item
const nameList = personList.map((person) => person.name);
const rawNameList = untracked(nameList);

rawNameList.at(1); // 'bob'
personList.set(1, { name: 'jill' });
rawNameList.at(1); // 'jill'
```

If you have a scenario where you only want to subscribe to changes to the last element in the list the `atomList.at` method is what to use.

```ts
const lastPersonsName = personList.at(-1);
untracked(lastPersonsName); // 'sam'

subscribe(lastPersonsName, (message) => console.log(`Last person changed`));
personList.set(1, { name: 'bob' });
// no log because last element did not change
personList.set(2, { name: 'jess' });
// log: 'Last person changed'
personList.pop();
// log: 'Last person changed'
```
