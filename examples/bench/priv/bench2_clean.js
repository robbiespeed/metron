import { bench, run } from 'mitata';

const nCount = 10000;
const iCount = 10000;

const MathRound = Math.round;

function dateFromMs(ms) {
  // Coercing to number, ms can be bigint
  return new Date(MathRound(Number(ms)));
}

const ObjectDefineProperty = Object.defineProperty;
const ObjectDefineProperties = Object.defineProperties;

const aMs = 1700962749299;
const bMs = 1700962768174;

class StatsDefineProps {
  constructor(aMs, bMs) {
    this.aTimeMs = aMs;
    this.bTimeMs = bMs;
  }
  get aTime() {
    const value = dateFromMs(this.aTimeMs);
    ObjectDefineProperty(this, 'aTime', { __proto__: null, value });
    return value;
  }
  get bTime() {
    const value = dateFromMs(this.bTimeMs);
    ObjectDefineProperty(this, 'bTime', { __proto__: null, value });
    return value;
  }
}

function statsDefinePropsRunA(stats) {
  let n = nCount;
  let r = 0;
  while (n-- > 0) {
    if (stats.aTimeMs < stats.bTimeMs) {
      r++;
    }
  }
}

function statsDefinePropsRunB(stats) {
  let n = nCount;
  let r = 0;
  while (n-- > 0) {
    if (stats.aTime.getSeconds() < stats.bTime.getSeconds()) {
      r++;
    }
  }
}

class StatsPrivateFields {
  #aTime;
  #bTime;

  constructor(aMs, bMs) {
    this.aTimeMs = aMs;
    this.bTimeMs = bMs;
  }
  get aTime() {
    return (this.#aTime ??= dateFromMs(this.aTimeMs));
  }
  get bTime() {
    return (this.#bTime ??= dateFromMs(this.bTimeMs));
  }
}

function statsPrivateFieldsRunA(stats) {
  let n = nCount;
  let r = 0;
  while (n-- > 0) {
    if (stats.aTimeMs < stats.bTimeMs) {
      r++;
    }
  }
}

function statsPrivateFieldsRunB(stats) {
  let n = nCount;
  let r = 0;
  while (n-- > 0) {
    if (stats.aTime.getSeconds() < stats.bTime.getSeconds()) {
      r++;
    }
  }
}

function StatsDefinePropsEnumerable(aMs, bMs) {
  this.aTimeMs = aMs;
  this.bTimeMs = bMs;
  ObjectDefineProperties(this, propDescriptors);
}

const propDescriptors = {
  __proto__: null,
  aTime: {
    __proto__: null,
    enumerable: true,
    configurable: true,
    get() {
      const value = dateFromMs(this.aTimeMs);
      ObjectDefineProperty(this, 'aTime', {
        __proto__: null,
        enumerable: true,
        writable: true,
        value,
      });
      return value;
    },
    // set should be added for real compat
  },
  bTime: {
    __proto__: null,
    enumerable: true,
    configurable: true,
    get() {
      const value = dateFromMs(this.bTimeMs);
      ObjectDefineProperty(this, 'bTime', {
        __proto__: null,
        enumerable: true,
        writable: true,
        value,
      });
      return value;
    },
    // set should be added for real compat
  },
};

function statsDefinePropsEnumerableRunA(stats) {
  let n = nCount;
  let r = 0;
  while (n-- > 0) {
    if (stats.aTimeMs < stats.bTimeMs) {
      r++;
    }
  }
}

function statsDefinePropsEnumerableRunB(stats) {
  let n = nCount;
  let r = 0;
  while (n-- > 0) {
    if (stats.aTime.getSeconds() < stats.bTime.getSeconds()) {
      r++;
    }
  }
}

class StatsPrivateFieldsEnumerable {
  #aTime;
  #bTime;

  constructor(aMs, bMs) {
    this.aTimeMs = aMs;
    this.bTimeMs = bMs;
    ObjectDefineProperties(this, StatsPrivateFieldsEnumerable.#propDescriptors);
  }
  static #propDescriptors = {
    __proto__: null,
    aTime: {
      __proto__: null,
      enumerable: true,
      get() {
        return (this.#aTime ??= dateFromMs(this.aTimeMs));
      },
      // set should be added for real compat
    },
    bTime: {
      __proto__: null,
      enumerable: true,
      get() {
        return (this.#bTime ??= dateFromMs(this.bTimeMs));
      },
      // set should be added for real compat
    },
  };
}

function statsPrivateFieldsEnumerableRunA(stats) {
  let n = nCount;
  let r = 0;
  while (n-- > 0) {
    if (stats.aTimeMs < stats.bTimeMs) {
      r++;
    }
  }
}

function statsPrivateFieldsEnumerableRunB(stats) {
  let n = nCount;
  let r = 0;
  while (n-- > 0) {
    if (stats.aTime.getSeconds() < stats.bTime.getSeconds()) {
      r++;
    }
  }
}

function StatsNoLazy(aMs, bMs) {
  this.aTimeMs = aMs;
  this.bTimeMs = bMs;
  this.aTime = dateFromMs(aMs);
  this.bTime = dateFromMs(bMs);
}

function statsNoLazyRunA(stats) {
  let n = nCount;
  let r = 0;
  while (n-- > 0) {
    if (stats.aTimeMs < stats.bTimeMs) {
      r++;
    }
  }
}

function statsNoLazyRunB(stats) {
  let n = nCount;
  let r = 0;
  while (n-- > 0) {
    if (stats.aTime.getSeconds() < stats.bTime.getSeconds()) {
      r++;
    }
  }
}

bench('With Define Property: Init only', () => {
  let i = iCount;
  while (i-- > 0) {
    const stats = new StatsDefineProps(aMs, bMs);
  }
});

bench('With Define Property', () => {
  let i = iCount;
  while (i-- > 0) {
    const stats = new StatsDefineProps(aMs, bMs);
    statsDefinePropsRunA(stats);
    stats.aTime;
    statsDefinePropsRunA(stats);
    statsDefinePropsRunB(stats);
    statsDefinePropsRunA(stats);
  }
});

bench('With Private Fields: Init only', () => {
  let i = iCount;
  while (i-- > 0) {
    const stats = new StatsPrivateFields(aMs, bMs);
  }
});

bench('With Private Fields', () => {
  let i = iCount;
  while (i-- > 0) {
    const stats = new StatsPrivateFields(aMs, bMs);
    statsPrivateFieldsRunA(stats);
    stats.aTime;
    statsPrivateFieldsRunA(stats);
    statsPrivateFieldsRunB(stats);
    statsPrivateFieldsRunA(stats);
  }
});

bench('With Enumerable Define Property: Init only', () => {
  let i = iCount;
  while (i-- > 0) {
    const stats = new StatsDefinePropsEnumerable(aMs, bMs);
  }
});

bench('With Enumerable Define Property', () => {
  let i = iCount;
  while (i-- > 0) {
    const stats = new StatsDefinePropsEnumerable(aMs, bMs);
    statsDefinePropsEnumerableRunA(stats);
    stats.aTime;
    statsDefinePropsEnumerableRunA(stats);
    statsDefinePropsEnumerableRunB(stats);
    statsDefinePropsEnumerableRunA(stats);
  }
});

bench('With Enumerable Private Fields: Init only', () => {
  let i = iCount;
  while (i-- > 0) {
    const stats = new StatsPrivateFieldsEnumerable(aMs, bMs);
  }
});

bench('With Enumerable Private Fields', () => {
  let i = iCount;
  while (i-- > 0) {
    const stats = new StatsPrivateFieldsEnumerable(aMs, bMs);
    statsPrivateFieldsEnumerableRunA(stats);
    stats.aTime;
    statsPrivateFieldsEnumerableRunA(stats);
    statsPrivateFieldsEnumerableRunB(stats);
    statsPrivateFieldsEnumerableRunA(stats);
  }
});

bench('With No Lazy: Init only', () => {
  let i = iCount;
  while (i-- > 0) {
    const stats = new StatsNoLazy(aMs, bMs);
  }
});

bench('With No Lazy', () => {
  let i = iCount;
  while (i-- > 0) {
    const stats = new StatsNoLazy(aMs, bMs);
    statsNoLazyRunA(stats);
    stats.aTime;
    statsNoLazyRunA(stats);
    statsNoLazyRunB(stats);
    statsNoLazyRunA(stats);
  }
});

await run();
