interface SignalOperators {
  startReceiving(): void;
  stopReceiving(): void;
  addSource(source: SignalNode): void;
  sources(): IterableIterator<SignalNode>;
  transmit(): void;
}

interface SignalNodeOptions {
  setup?: (operators: SignalOperators) => void;
  receive?: () => void;
}

interface EmitterWithOperators extends SignalOperators {
  signalNode: SignalNode;
}

interface SignalLink {
  version: number;
  consumer: SignalNode;
  source: SignalNode;
  nextSource?: SignalLink;
  prevSource?: SignalLink;
  nextConsumer?: SignalLink;
  previousConsumer?: SignalLink;
}

// interface ConsumerWeakLink {
//   consumer: WeakRef<SignalNode>;
//   source: WeakRef<SignalNode>;
//   rootSource: SignalNode;
//   next?: ConsumerWeakLink;
//   previous?: ConsumerWeakLink;
// }

let nextId = 0n;

export class SignalNode {
  #id = `${nextId++}`;
  #version = 0;
  #isConsuming = false;
  // key is source.id
  #sourceRecord: Record<string, SignalLink> = Object.create(null);
  #sourceHead: undefined | SignalLink;
  // // key is consumer.id
  // #consumerRecord: Record<string, SignalLink> = Object.create(null);
  // #consumerHead: undefined | SignalLink;
  //

  constructor(options?: SignalNodeOptions) {
    options?.setup?.(this.#getOperators());
  }
  // #send(signal: any) {}
  // #refreshConsumedSources() {}
  // TODO: Should make this a recursive loop with local stack to avoid call stack issues
  #startConsuming() {
    if (this.#isConsuming) {
      return;
    }

    this.#isConsuming = true;

    let sourceLink = this.#sourceHead;
    if (sourceLink === undefined) {
      return;
    }

    // May be possible to walk all the way to roots and consume them directly?

    // Walks source graph and adds consumer links to roots
    while (sourceLink) {
      const { source } = sourceLink;

      // const consumerRecord = this.#consumerRecord ??= {};
      // const existingConsumerHead = source.#consumerHead;
      // const consumerLink: SignalLink = consumerRecord[this.#id] = {

      // };

      // if (existingConsumerHead) {
      //   existingConsumerHead.previousConsumer = consumerLink;
      // }
      source.#startConsuming();

      sourceLink = sourceLink.nextSource;
    }
  }
  // #stopConsuming() {
  //   if (!this.#isConsuming) {
  //     return;
  //   }

  //   // if (preserve) {
  //   //   let sourceLink = this.#sourceHead;

  //   //   while (sourceLink) {
  //   //     const source = sourceLink.source;

  //   //   }

  //   //   return;
  //   // }

  //   let sourceLink = this.#sourceHead;

  //   this.#isConsuming = true;

  //   while (sourceLink) {
  //     const { source } = sourceLink;

  //     const consumerRecord = source.#consumerRecord;
  //     const consumerLink = consumerRecord![this.#id]!;

  //     const nextLink = consumerLink.nextConsumer;
  //     const prevLink = consumerLink.previousConsumer;

  //     consumerLink.nextConsumer = undefined;

  //     if (prevLink) {
  //       consumerLink.previousConsumer = undefined;
  //       prevLink.nextConsumer = nextLink;
  //     } else {
  //       // source.#consumerHead = nextLink;
  //     }

  //     sourceLink = sourceLink.nextSource;
  //   }
  // }
  _addSource(source: SignalNode) {
    const sourceRecord = (this.#sourceRecord ??= {});
    if (sourceRecord[source.#id]) {
      return;
    }

    const oldHead = this.#sourceHead;

    const sourceLink: SignalLink = (this.#sourceHead = {
      consumer: this,
      source,
      version: source.#version,
      prevSource: undefined,
      nextSource: oldHead,
      previousConsumer: undefined,
      nextConsumer: undefined,
    });

    if (oldHead) {
      oldHead.prevSource = sourceLink;
    }
  }
  #getOperators(): SignalOperators {
    let addSource: SignalOperators['addSource'];
    return {
      get addSource() {
        return (addSource ??= this._addSource.bind(this));
      },
    } as any;
  }
  static withOperators(options?: SignalNodeOptions): EmitterWithOperators {
    const emitter = new SignalNode(options) as any;

    return { emitter, ...emitter.#getOperators() };
  }
}

// const emptyCache = Symbol();

// function createComputed(c: any) {
//   let storedValue = emptyCache;
//   const { signalNode, addSource } = SignalNode.withOperators({
//     receive() {
//       storedValue = emptyCache;
//     },
//   });

//   function checkNeedsRecompute() {
//     if (storedValue === emptyCache) {
//     }
//   }

//   function get() {
//     if (storedValue === emptyCache) {
//       storedValue = c(addSource);
//     }
//     return storedValue;
//   }

//   return {
//     get,
//     signalNode,
//   };
// }
