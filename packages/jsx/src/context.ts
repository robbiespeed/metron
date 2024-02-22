import type { Disposer } from '@metron/core/shared.js';
import {
  convertToStaticComponent,
  IS_NODE,
  NODE_TYPE_CONTEXT_PROVIDER,
  type JSXContextProviderNode,
} from './node.js';

export interface ContextStore {
  [stateKey: symbol]: unknown;
}

export interface ContextProviderProps {
  assignments: Partial<ContextStore>;
  children?: unknown;
}

export const ContextProvider = convertToStaticComponent<
  ContextProviderProps,
  JSXContextProviderNode
>((props) => {
  return {
    [IS_NODE]: true,
    nodeType: NODE_TYPE_CONTEXT_PROVIDER,
    tag: undefined,
    props,
  };
});

export type Register = (disposer: Disposer) => undefined;

// interface Context {
//   // TODO: remove undefined (throw instead)
//   use: <T extends symbol>(key: T) => ContextStore[T] | undefined;
//   register: Register;
// }

export type { Context };

class Context {
  #disposers!: Disposer[];
  #store!: ContextStore;
  // TODO: remove undefined (throw instead)
  use = <T extends symbol>(key: T): ContextStore[T] | undefined => {
    return this.#store[key];
  };
  register = (disposer: Disposer): undefined => {
    this.#disposers.push(disposer);
  };
  static fork(parent: Context): Context {
    const context = new Context();
    context.#store = parent.#store;
    context.#disposers = [];
    return context;
  }
  static controlledFork(parent: Context, disposers: Disposer[]): Context {
    const context = new Context();
    context.#store = parent.#store;
    context.#disposers = disposers;
    return context;
  }
  static extend(parent: Context, assignments: Partial<ContextStore>): Context {
    const context = new Context();
    context.#store = { ...parent.#store, ...assignments };
    context.#disposers = [];
    return context;
  }
  static createRoot(): Context {
    const context = new Context();
    context.#disposers = [];
    context.#store = {};
    return context;
  }
  static dispose(context: Context): undefined {
    const disposers = context.#disposers;
    for (let i = 0; i < disposers.length; i++) {
      disposers[i]!();
    }
  }
  static disposeMany(contexts: Context[]) {
    for (let i = 0; i < contexts.length; i++) {
      const disposers = contexts[i]!.#disposers;
      for (let j = 0; j < disposers.length; j++) {
        disposers[j]!();
      }
    }
  }
  static disposeManySparse(contexts: (Context | undefined)[]) {
    for (let i = 0; i < contexts.length; i++) {
      const context = contexts[i];
      if (context === undefined) {
        continue;
      }
      const disposers = context.#disposers;
      for (let j = 0; j < disposers.length; j++) {
        disposers[j]!();
      }
    }
  }
}

export const createRootContext = Context.createRoot;
export const forkContext = Context.fork;
export const controlledForkContext = Context.controlledFork;

export const disposeContext = Context.dispose;
export const disposeContexts = Context.disposeMany;
export const disposeSparseContexts = Context.disposeManySparse;

// export type { Context };

// const rootUse = () => {
//   throw new Error('TODO');
// };

// export function createRootContext(): [Context, Disposer] {
//   const disposers: Disposer[] = [];
//   return [
//     {
//       use: rootUse,
//       register: (disposer: Disposer) => {
//         disposers.push(disposer);
//       },
//     },
//     () => {
//       for (let i = 0; i < disposers.length; i++) {
//         disposers[i]!();
//       }
//     },
//   ];
// }
