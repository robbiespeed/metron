import { signalKey, type Atom, toValueKey } from './particle.js';
import { SignalNode } from './signal-node.js';

export interface Selector<T> {
  (match: T): Atom<boolean>;
  <U>(match: T, deriver: (isSelected: boolean) => U): Atom<U>;
}

export function createSelector<T>(
  initial: T
): [Selector<T>, (value: T) => void] {
  const weakEmitters = new Map<T, WeakRef<SignalNode>>();

  let storedValue = initial;

  const finalizationRegistry = new FinalizationRegistry((value: T) => {
    weakEmitters.delete(value);
  });

  function set(value: T): void {
    if (storedValue === value) {
      return;
    }
    const oldValue = storedValue;
    storedValue = value;
    weakEmitters.get(oldValue)?.deref()?.update();
    weakEmitters.get(storedValue)?.deref()?.update();
  }

  function selector<U>(
    match: T,
    deriver?: (isSelected: boolean) => U
  ): Atom<unknown> {
    let matchEmitter = weakEmitters.get(match)?.deref();

    if (matchEmitter === undefined) {
      const signalNode = new SignalNode(undefined) as SignalNode;
      signalNode.initAsSource();
      matchEmitter = signalNode;

      weakEmitters.set(match, signalNode.weakRef);

      finalizationRegistry.register(matchEmitter, match);
    }

    return deriver
      ? {
          [toValueKey]() {
            return deriver(storedValue === match);
          },
          [signalKey]: matchEmitter,
        }
      : {
          [toValueKey]() {
            return storedValue === match;
          },
          [signalKey]: matchEmitter,
        };
  }

  return [selector as Selector<T>, set];
}

// class SelectorC <T> {
//   #nodes = new Map<T, WeakRef<SignalNode>>();
//   #storedValue: T;
//   private constructor (initial: T) {
//     this.#storedValue = initial;
//   }

//   #set(value: T) {
//     const storedValue = this.#storedValue;
//     if (storedValue === value) {
//       return;
//     }
//     const oldValue = this.#storedValue;
//     this.#storedValue = value;
//     const nodes = this.#nodes;
//     nodes.get(oldValue)?.deref()?.update();
//     nodes.get(storedValue)?.deref()?.update();
//   }

//   selection(match: T) {
//     const nodes = this.#nodes;
//     let matchEmitter = nodes.get(match)?.deref();

//   }

//   mapSelection<U>(match: T, mapper: (isSelected: boolean) => U) {

//   }

//   static {
//     class Selection implements Atom<boolean> {
//       #node?: SignalNode;
//       #match: unknown;
//       #selector: SelectorC<unknown>;
//       constructor (selector: SelectorC<unknown>, value: unknown) {
//         this.#selector = selector;
//         this.#match = value;
//       }
//       get [signalKey] () {
//         let node = this.#node;
//         if (node !== undefined) {
//           return node;
//         }

//       }
//       [toValueKey] (): boolean {
//         return this.#match === this.#selector.#storedValue;
//       }
//     }
//   }

//   static create <T> () {

//   }
// }
