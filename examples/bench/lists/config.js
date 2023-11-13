import { untracked } from 'metron-core/particle.js';

export const sourceListCount = 1;

export const mapCount = 10;

// min 11
export const listItemCount = 12;

export const runCount = 100_000;

export const subCount = 10;

function assertEq(value, expected, message) {
  if (value !== expected) {
    throw new Error(
      `Assertion - ${
        message ?? 'unknown'
      }: ${value} (input) !== ${expected} (expected)`
    );
  }
}

export function setup(listCreator) {
  const lists = new Array(sourceListCount);

  const counter = { subHits: 0, collectionMsgHits: 0, listMsgHits: 0 };

  function handleDataCollection(data) {
    counter.collectionMsgHits++;
    assertEq(typeof data, 'object');
  }

  function handleDataList(data) {
    counter.listMsgHits++;
    assertEq(typeof data, 'object');
  }

  function handleDataListReverse(data) {
    counter.listMsgHits++;
    assertEq(typeof data, 'number');
  }

  function subHandler(msg) {
    counter.subHits++;
    if (msg.type.startsWith('Collection')) {
      handleDataCollection(msg.data);
    } else if (msg.type.endsWith('Reverse')) {
      handleDataListReverse(msg.data);
    } else {
      handleDataList(msg.data);
    }
  }

  for (let i = 0; i < sourceListCount; i++) {
    const data = new Array(listItemCount)
      .fill(undefined)
      .map((_, j) => ({ i, j }));

    const [source, writer] = listCreator(data);

    const maps = new Array(mapCount);

    for (let m = 0; m < mapCount; m++) {
      maps[m] = source.map(function mapper(v) {
        return `${m}:${v.i}:${v.j}`;
      });
    }

    for (let s = 0; s < subCount; s++) {
      source.subscribe(subHandler);
    }

    lists[i] = { reader: untracked(source), writer, maps };
  }

  return {
    lists,
    counter,
  };
}

function innerRun({ lists, counter }) {
  for (const [i, list] of lists.entries()) {
    const m = Math.trunc(mapCount * Math.random());
    const mapped = untracked(list.maps[m]);
    mapped.forEach((v, j) => {
      assertEq(v, `${m}:${i}:${j}`, 'Map');
    });
    list.writer.delete(9);
    assertEq(list.reader.get(9).j, 10, 'Deletion');
    list.writer.insert(7, { i: -1, j: -1 });
    assertEq(list.reader.get(7).i, -1, 'Insert');
    assertEq(mapped.get(7), `${m}:-1:-1`, 'Insert > Map');

    // Reset
    list.writer.delete(7);
    assertEq(list.reader.get(7).j, 7, 'Reset > Deletion');
    list.writer.insert(9, { i, j: 9 });
    assertEq(list.reader.get(9).j, 9, 'Reset > Insert');
  }

  const numOfChanges = 4;
  assertEq(
    counter.subHits,
    sourceListCount * subCount * numOfChanges,
    'Sub Hits'
  );
  counter.subHits = 0;
}

export function run(params) {
  for (let i = 0; i < runCount; i++) {
    innerRun(params);
  }
}

function createRaw(i) {
  return new Array(listItemCount).fill(undefined).map((_, j) => ({ i, j }));
}

export function setupRaw() {
  const lists = new Array(sourceListCount);

  const counter = { subHits: 0 };

  for (let i = 0; i < sourceListCount; i++) {
    const data = createRaw(i);

    const maps = new Array(mapCount);
    const mappers = new Array(mapCount);

    for (let m = 0; m < mapCount; m++) {
      const mapper = (mappers[m] = (v) => `${m}:${v.i}:${v.j}`);
      maps[m] = data.map(mapper);
    }

    lists[i] = { data, maps, mappers };
  }

  return {
    lists,
    counter,
  };
}

const invalidMaps = new Set();

function invalidateMaps(maps, i) {
  for (const m of maps.keys()) {
    invalidMaps.add(`${m}:${i}`);
  }
}

function getValidMap(list, m, i) {
  const maps = list.maps;
  const hash = `${m}:${i}`;
  if (invalidMaps.has(hash)) {
    maps[m] = list.data.map(list.mappers[m]);
    invalidMaps.delete(hash);
  }
  return maps[m];
}

function innerRunRaw({ lists, counter }) {
  for (const [i, list] of lists.entries()) {
    const m = Math.trunc(mapCount * Math.random());
    let mapped = getValidMap(list, m, i);
    mapped.forEach((v, j) => {
      assertEq(v, `${m}:${i}:${j}`, 'Map');
    });
    list.data.splice(9, 1);
    invalidateMaps(list.maps, i);
    counter.subHits++;
    assertEq(list.data[9].j, 10, 'Deletion');

    list.data.splice(7, 0, { i: -1, j: -1 });
    invalidateMaps(list.maps, i);
    counter.subHits++;
    assertEq(list.data[7].i, -1, 'Insert');

    mapped = getValidMap(list, m, i);
    assertEq(mapped[7], `${m}:-1:-1`, 'Insert > Map');

    // Reset
    list.data.splice(7, 1);
    invalidateMaps(list.maps, i);
    counter.subHits++;
    assertEq(list.data[7].j, 7, 'Reset > Deletion');

    list.data.splice(9, 0, { i, j: 9 });
    invalidateMaps(list.maps, i);
    counter.subHits++;
    assertEq(list.data[9].j, 9, 'Reset > Insert');
  }

  const numOfChanges = 4;
  assertEq(counter.subHits, sourceListCount * numOfChanges, 'Sub Hits');
  counter.subHits = 0;
}

export function runRaw() {
  const params = setupRaw();
  for (let i = 0; i < runCount; i++) {
    innerRunRaw(params);
  }
}
