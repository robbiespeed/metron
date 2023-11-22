import type { Atom } from '../atom.js';
import type { EmitMessage } from '../emitter.js';

export const COLLECTION_EMIT_TYPE_KEY_WRITE = 'CollectionKeyWrite';
export const COLLECTION_EMIT_TYPE_KEY_ADD = 'CollectionKeyAdd';
export const COLLECTION_EMIT_TYPE_KEY_DELETE = 'CollectionKeyDelete';
export const COLLECTION_EMIT_TYPE_KEY_SWAP = 'CollectionKeySwap';
export const COLLECTION_EMIT_TYPE_CLEAR = 'CollectionClear';

export type AtomCollectionEmitKeyWrite<TKey = unknown> = EmitMessage<
  typeof COLLECTION_EMIT_TYPE_KEY_WRITE,
  {
    readonly key: TKey;
    readonly size: number;
  }
>;

export type AtomCollectionEmitKeyAdd<TKey = unknown> = EmitMessage<
  typeof COLLECTION_EMIT_TYPE_KEY_ADD,
  {
    readonly key: TKey;
    readonly size: number;
    readonly oldSize: number;
  }
>;

export type AtomCollectionEmitKeyDelete<TKey = unknown> = EmitMessage<
  typeof COLLECTION_EMIT_TYPE_KEY_DELETE,
  {
    readonly key: TKey;
    readonly size: number;
    readonly oldSize: number;
  }
>;

export type AtomCollectionEmitKeySwap<TKey = unknown> = EmitMessage<
  typeof COLLECTION_EMIT_TYPE_KEY_SWAP,
  {
    /**
     * a < b
     */
    readonly keySwap: readonly [a: TKey, b: TKey];
    readonly size: number;
  }
>;

export type AtomCollectionEmitClear = EmitMessage<
  typeof COLLECTION_EMIT_TYPE_CLEAR,
  {
    readonly size: number;
    readonly oldSize: number;
  }
>;

export type AtomEmitMapValues<TEmitMap extends {}> = TEmitMap[keyof TEmitMap];

export interface AtomCollectionEmitMap<TKey = unknown> {
  keyWrite: AtomCollectionEmitKeyWrite<TKey>;
  keyAdd: AtomCollectionEmitKeyAdd<TKey>;
  keyDelete: AtomCollectionEmitKeyDelete<TKey>;
  // keySwap: AtomCollectionEmitKeySwap<TKey>;
  clear: AtomCollectionEmitClear;
}

export type AtomCollectionEmit<TKey = unknown> =
  AtomCollectionEmitMap<TKey>[keyof AtomCollectionEmitMap];

export interface UnwrappedAtomCollection<TKey, TValue> {
  [Symbol.iterator](): IterableIterator<unknown>;
  entries(): IterableIterator<[TKey, TValue]>;
  keys(): IterableIterator<TKey>;
  values(): IterableIterator<TValue>;
}

export interface AtomCollection<
  TKey,
  TValue,
  TUnwrapped extends UnwrappedAtomCollection<
    TKey,
    TValue
  > = UnwrappedAtomCollection<TKey, TValue>,
  TEmit extends EmitMessage = AtomCollectionEmit
> extends Atom<TUnwrapped, TEmit> {
  // readonly size: Atom<number>;
}

// export class CollectionSizeAtom implements Atom<number> {
//   #innerValues: unknown[];
//   #storedSize: number;
//   #orb: TransceiverOrb<CollectionSizeAtom>;
//   #emitter?: Emitter<void>;
//   #emit = emptyFn;
//   constructor(innerValues: unknown[], sourceOrb: TransmitterOrb) {
//     this.#orb = createRelayOrb(this, CollectionSizeAtom.#intercept, [
//       sourceOrb,
//     ]);
//     this.#innerValues = innerValues;
//     this.#storedSize = innerValues.length;
//   }
//   get [EMITTER](): Emitter<void> {
//     const existingEmitter = this.#emitter;
//     if (existingEmitter !== undefined) {
//       return existingEmitter;
//     }

//     const { emitter, emit } = createEmitter();

//     this.#emitter = emitter;
//     this.#emit = emit;

//     return emitter;
//   }
//   get [ORB](): TransmitterOrb {
//     return this.#orb;
//   }
//   unwrap(): number {
//     return this.#storedSize;
//   }
//   static #intercept(this: Orb<CollectionSizeAtom>) {
//     const atom = this.data;
//     const currentSize = atom.#innerValues.length;
//     if (atom.#storedSize !== currentSize) {
//       atom.#storedSize = currentSize;
//       atom.#emit();
//       return true;
//     }
//     return false;
//   }
// }

// function bindableWeakTransmit<TKey>(
//   this: Map<TKey, WeakRef<() => void>>,
//   key: TKey
// ) {
//   this.get(key)?.deref()?.();
// }

// export class OrbKeyMap<TKey, TEmit extends EmitMessageOption> {
//   #weakKeyOrbs = new Map<TKey, WeakRef<TransmitterOrb>>();
//   #weakKeyTransmits = new Map<TKey, WeakRef<() => void>>();
//   #emitDisposer: undefined | Disposer;
//   #finalizationRegistry = new FinalizationRegistry((key: TKey) => {
//     this.#weakKeyTransmits.delete(key);
//     const orbs = this.#weakKeyOrbs;
//     orbs.delete(key);

//     if (orbs.size === 0) {
//       const emitDisposer = this.#emitDisposer;
//       if (emitDisposer) {
//         emitDisposer();
//         this.#emitDisposer = undefined;
//       }
//     }
//   });
//   #subHandler: SubscriptionHandler<TEmit>;
//   #emitter: Emitter<TEmit>;
//   weakTransmit: (key: TKey) => void;
//   constructor(emitter: Emitter<TEmit>, subHandler: SubscriptionHandler<TEmit>) {
//     this.#emitter = emitter;
//     this.#subHandler = subHandler;
//     this.weakTransmit = bindableWeakTransmit.bind(this.#weakKeyTransmits);
//   }
//   get(key: TKey): TransmitterOrb {
//     let keyOrb: TransmitterOrb | undefined = this.#weakKeyOrbs
//       .get(key)
//       ?.deref();

//     if (keyOrb === undefined) {
//       const { orb, transmit } = createTransmitterOrb();
//       keyOrb = orb;

//       this.#finalizationRegistry.register(keyOrb, key);

//       this.#emitDisposer ??= this.#emitter.subscribe(this.#subHandler);

//       this.#weakKeyOrbs.set(key, keyOrb.weakRef);
//       this.#weakKeyTransmits.set(key, new WeakRef(transmit));
//     }

//     return keyOrb;
//   }
//   weakTransmitEntries(): IterableIterator<[TKey, WeakRef<() => void>]> {
//     return this.#weakKeyTransmits.entries();
//   }
// }
