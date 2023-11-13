import { derived, createAtom, type AtomLike } from './lib2.ts';

for (let r = 0; r < 10_000; r++) {
  const [head, setHead] = createAtom(1);

  let tail: AtomLike<number> = head;

  for (let i = 0; i < 70; i++) {
    const prev = tail;
    tail = derived([prev], () => prev.unwrap() + 1);
  }

  let result = tail.read();

  if (result !== 71) {
    throw new Error(`result ${result} not 71`);
  }

  setHead(2);

  result = tail.read();

  if (result !== 72) {
    throw new Error(`result ${result} not 72`);
  }
}
