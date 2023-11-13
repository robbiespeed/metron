import {
  graphDepth,
  readAfterUpdateCount,
  runCount,
  updateCount,
} from './config.ts';
import { computed, createAtom, type Atom } from './lib4.ts';

for (let r = 0; r < runCount; r++) {
  const [head, setHead] = createAtom(-1);

  let tail: Atom<number> = head;

  for (let i = 0; i < graphDepth; i++) {
    const prev = tail;
    tail = computed((read) => read(prev) + 1);
  }

  let result = tail.unwrap();

  if (result !== graphDepth - 1) {
    throw new Error(`result ${result} not ${graphDepth - 1}`);
  }

  for (let i = 0; i < updateCount; i++) {
    setHead(i);

    result = tail.unwrap();

    for (let j = 0; j < readAfterUpdateCount; j++) {
      result = tail.unwrap();
    }

    if (result !== graphDepth + i) {
      throw new Error(`result ${result} not ${graphDepth + i}`);
    }
  }

  await new Promise((res) => setTimeout(res, 0));
}
