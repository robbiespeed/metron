import type { Disposer } from '@metron/core/shared.js';
import {
  convertToStaticComponent,
  IS_NODE,
  NODE_TYPE_UNSAFE,
  type JSXUnsafeNode,
  type RenderFn,
} from './node.js';

export const Render: ContextKey<RenderFn> = () => {
  throw new Error('No Render Context');
};

// TODO: make this a Component (used to assign single Context value) with a symbol for fallback value fn
// rename to ContextComponent
export type ContextKey<TValue> = () => TValue;

type ContextStore = Map<ContextKey<unknown>, unknown>;

export interface ContextProviderProps {
  assignments: [key: ContextKey<unknown>, value: unknown][];
  children?: unknown;
}

export const ContextProvider = convertToStaticComponent(
  (props: ContextProviderProps): JSXUnsafeNode<ContextProviderProps> => {
    return {
      [IS_NODE]: true,
      nodeType: NODE_TYPE_UNSAFE,
      tag: insertContextJSX,
      props,
    };
  }
);

function insertContextJSX(
  { children, assignments }: ContextProviderProps,
  context: Context,
  ...rest: unknown[]
): undefined {
  if (children != null) {
    const childContext = extendContext(context, assignments);
    childContext.use(Render)(children, childContext, ...rest);
  }
}

export type Register = (disposer: Disposer) => undefined;

export type { Context };

// TODO: make this not a class and remove all dispose fns
// fork and root should return a disposers along with the forked context
// see notes/context-types.md for making extend and root type safe
class Context {
  #disposers!: Disposer[];
  #store!: ContextStore;
  use = <T>(key: ContextKey<T>): T => {
    return (this.#store.get(key) as T | undefined) ?? key();
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
  static extend(
    parent: Context,
    assignments: [key: ContextKey<unknown>, value: unknown][]
  ): Context {
    const context = new Context();
    context.#store = new Map([...parent.#store, ...assignments]);
    context.#disposers = [];
    return context;
  }
  static createRoot(
    assignments?: [key: ContextKey<unknown>, value: unknown][]
  ): Context {
    const context = new Context();
    context.#disposers = [];
    context.#store = new Map(assignments);
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
export const extendContext = Context.extend;
export const controlledForkContext = Context.controlledFork;

export const disposeContext = Context.dispose;
export const disposeContexts = Context.disposeMany;
export const disposeSparseContexts = Context.disposeManySparse;
