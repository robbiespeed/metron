import { signalKey, type Atom, toValueKey } from '../particle.js';
import type {
  EmitMessage,
  EmitMessageOption,
  Emitter,
  SubscriptionHandler,
} from '../emitter.js';
import { SignalNode, type Disposer } from '../signal-node.js';

export const collectionKeyToValueKey = Symbol('MetronAtomCollectionKeyToValue');

export const COLLECTION_EMIT_TYPE_KEY_WRITE = 'CollectionKeyWrite';
export const COLLECTION_EMIT_TYPE_KEY_ADD = 'CollectionKeyAdd';
export const COLLECTION_EMIT_TYPE_KEY_DELETE = 'CollectionKeyDelete';
export const COLLECTION_EMIT_TYPE_KEY_SWAP = 'CollectionKeySwap';
export const COLLECTION_EMIT_TYPE_KEY_BATCH = 'CollectionKeyBatch';
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
  keySwap: AtomCollectionEmitKeySwap<TKey>;
  clear: AtomCollectionEmitClear;
}

export type AtomCollectionEmit<TKey = unknown> =
  AtomCollectionEmitMap<TKey>[keyof AtomCollectionEmitMap];

export interface AtomCollectionUntrackedReader<TValue, TKey = unknown> {
  readonly size: number;
  get(key: TKey): TValue | undefined;
  [Symbol.iterator](): IterableIterator<TValue>;
  entries(): IterableIterator<[TKey, TValue]>;
  keys(): IterableIterator<TKey>;
  values(): IterableIterator<TValue>;
}

export type GetRawAtomCollectionValue<TRaw> =
  TRaw extends AtomCollectionUntrackedReader<infer TValue> ? TValue : never;

export interface AtomCollection<
  TValue,
  TKey = unknown,
  TRaw extends AtomCollectionUntrackedReader<
    TValue,
    TKey
  > = AtomCollectionUntrackedReader<TValue, TKey>,
  TEmit extends EmitMessage = AtomCollectionEmit
  // TEmitMap extends AtomCollectionEmitMap<TKey> = AtomCollectionEmitMap<TKey>
> extends Atom<TRaw> {
  readonly size: Atom<number>;
  get(key: TKey): Atom<TValue | undefined>;
  subscribe(handler: SubscriptionHandler<TEmit>): Disposer;
}

export function isAtomCollection(
  value: unknown
): value is AtomCollection<unknown> {
  return (value as any)?.[collectionKeyToValueKey] !== undefined;
}

function collectionSizeIntercept(this: SignalNode<CollectionSizeAtom>) {
  const { meta } = this;
  const currentSize = meta['innerValues'].length;
  if (meta['storedSize'] !== currentSize) {
    meta['storedSize'] = currentSize;
    return true;
  }
  return false;
}

export class CollectionSizeAtom implements Atom<number> {
  private innerValues: unknown[];
  private storedSize: number;
  private node = new SignalNode<CollectionSizeAtom>(
    this,
    collectionSizeIntercept
  );
  readonly [signalKey] = this.node as SignalNode;
  constructor(innerValues: unknown[], sourceNode: SignalNode) {
    const { node } = this;
    node.initAsSource();
    node.initAsConsumer();
    node.recordSource(sourceNode, false);
    this.innerValues = innerValues;
    this.storedSize = innerValues.length;
  }
  [toValueKey]() {
    return this.storedSize;
  }
}

export class SignalNodeKeyMap<TKey, TEmit extends EmitMessageOption> {
  private weakKeyNodes = new Map<TKey, WeakRef<SignalNode>>();
  private emitDisposer: undefined | Disposer;
  private finalizationRegistry = new FinalizationRegistry((key: TKey) => {
    const { weakKeyNodes } = this;
    weakKeyNodes.delete(key);

    if (weakKeyNodes.size === 0) {
      const { emitDisposer } = this;
      if (emitDisposer) {
        emitDisposer();
        this.emitDisposer = undefined;
      }
    }
  });
  private subHandler: SubscriptionHandler<TEmit>;
  private emitter: Emitter<TEmit>;
  getWeakNode: (key: TKey) => WeakRef<SignalNode> | undefined;
  constructor(emitter: Emitter<TEmit>, subHandler: SubscriptionHandler<TEmit>) {
    this.emitter = emitter;
    this.subHandler = subHandler;
    const weakKeyNodes = this.weakKeyNodes;
    this.getWeakNode = weakKeyNodes.get.bind(weakKeyNodes);
  }
  get(key: TKey): SignalNode {
    let keyNode: SignalNode | undefined = this.weakKeyNodes.get(key)?.deref();

    if (keyNode === undefined) {
      keyNode = new SignalNode<unknown>(undefined);
      keyNode.initAsSource();

      this.finalizationRegistry.register(keyNode, key);

      this.emitDisposer ??= this.emitter.subscribe(this.subHandler);

      this.weakKeyNodes.set(key, keyNode.weakRef);
    }

    return keyNode;
  }
  weakNodeEntries(): IterableIterator<[TKey, WeakRef<SignalNode>]> {
    return this.weakKeyNodes.entries();
  }
}
