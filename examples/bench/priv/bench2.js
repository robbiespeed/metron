import { bench, run } from 'mitata';

const nCount = 1000;
const iCount = 1000;

const MathRound = Math.round;

function dateFromMs(ms) {
  // Coercing to number, ms can be bigint
  return new Date(MathRound(Number(ms)));
}

const ObjectDefineProperty = Object.defineProperty;

const aMs = 1700962749299;
const bMs = 1700962768174;

class StatA {
  #aTime;
  #bTime;

  constructor(aMs, bMs) {
    this.aTimeMs = aMs;
    this.bTimeMs = bMs;
  }
  // get aTime() {
  //   return (this.#aTime ??= dateFromMs(this.aTimeMs));
  // }
  // get bTime() {
  //   return (this.#bTime ??= dateFromMs(this.bTimeMs));
  // }
  static {
    const proto = StatA.prototype;
    ObjectDefineProperty(proto, 'aTime', {
      __proto__: null,
      enumerable: true,
      get() {
        return (this.#aTime ??= dateFromMs(this.aTimeMs));
      },
      set(value) {
        this.#aTime = value;
      },
    });
    ObjectDefineProperty(proto, 'bTime', {
      __proto__: null,
      enumerable: true,
      get() {
        return (this.#bTime ??= dateFromMs(this.bTimeMs));
      },
      set(value) {
        this.#bTime = value;
      },
    });
  }
}

function statARunA(stat) {
  let n = nCount;
  let r = 0;
  while (n-- > 0) {
    if (stat.aTimeMs < stat.bTimeMs) {
      r++;
    }
  }
}

function statARunB(stat) {
  let n = nCount;
  let r = 0;
  while (n-- > 0) {
    if (stat.aTime.getSeconds() < stat.bTime.getSeconds()) {
      r++;
    }
  }
}

class StatB {
  constructor(aMs, bMs) {
    this.aTimeMs = aMs;
    this.bTimeMs = bMs;
  }
  // get aTime() {
  //   const value = dateFromMs(this.aTimeMs);
  //   ObjectDefineProperty(this, 'aTime', { __proto__: null, value });
  //   return value;
  // }
  // get bTime() {
  //   const value = dateFromMs(this.bTimeMs);

  //   ObjectDefineProperty(this, 'bTime', { __proto__: null, value });

  //   return value;
  // }

  static {
    const proto = StatB.prototype;
    ObjectDefineProperty(proto, 'aTime', {
      __proto__: null,
      enumerable: true,
      get() {
        const value = dateFromMs(this.aTimeMs);
        ObjectDefineProperty(this, 'aTime', { __proto__: null, value });
        return value;
      },
      set(value) {
        ObjectDefineProperty(this, 'aTime', { __proto__: null, value });
      },
    });
    ObjectDefineProperty(proto, 'bTime', {
      __proto__: null,
      enumerable: true,
      get() {
        const value = dateFromMs(this.bTimeMs);
        ObjectDefineProperty(this, 'bTime', { __proto__: null, value });
        return value;
      },
      set(value) {
        ObjectDefineProperty(this, 'bTime', { __proto__: null, value });
      },
    });
  }
}

function statBRunA(stat) {
  let n = nCount;
  let r = 0;
  while (n-- > 0) {
    if (stat.aTimeMs < stat.bTimeMs) {
      r++;
    }
  }
}

function statBRunB(stat) {
  let n = nCount;
  let r = 0;
  while (n-- > 0) {
    if (stat.aTime.getSeconds() < stat.bTime.getSeconds()) {
      r++;
    }
  }
}

bench('WithPrivates', () => {
  let i = iCount;
  while (i-- > 0) {
    const stat = new StatA(aMs, bMs);
    statARunA(stat);
    stat.aTime;
    statARunA(stat);
    statARunB(stat);
    statARunA(stat);
  }
});

bench('With DefineProp', () => {
  let i = iCount;
  while (i-- > 0) {
    const stat = new StatB(aMs, bMs);
    statBRunA(stat);
    stat.aTime;
    statBRunA(stat);
    statBRunB(stat);
    statBRunA(stat);
  }
});

await run();
