import type { Disposer } from 'metron-core';
import {
  createStaticComponent,
  nodeBrandKey,
  type JSXContextProviderNode,
} from './node.js';

export interface JSXContextStore {
  [stateKey: symbol]: unknown;
}

export interface JSXContext {
  [contextInternalsKey]: Partial<JSXContextStore>;
  addDisposer: (...disposers: Disposer[]) => void;
  use: <T extends symbol>(stateKey: T) => JSXContextStore[T] | undefined;
}
const contextInternalsKey = Symbol('MetronJSXContextInternals');

export function createRootContext(
  addDisposer: (...disposers: Disposer[]) => void,
  assignments?: Partial<JSXContextStore>
): JSXContext {
  const internalState: Partial<JSXContextStore> = { ...assignments };

  const context: JSXContext = {
    [contextInternalsKey]: internalState,
    addDisposer,
    use: (stateKey) => internalState[stateKey],
  };

  return context;
}

export function createChildContext(
  parentContext: JSXContext,
  assignments?: Partial<JSXContextStore>
): JSXContext {
  const parentInternal = parentContext[contextInternalsKey];
  const internalState: Partial<JSXContextStore> =
    assignments === undefined
      ? parentInternal
      : {
          ...parentInternal,
          ...assignments,
        };

  return {
    [contextInternalsKey]: internalState,
    addDisposer: parentContext.addDisposer,
    use: (stateKey) => internalState[stateKey],
  };
}

interface ContextProviderProps {
  assignments: Partial<JSXContextStore>;
  children?: unknown;
}

export const ContextProvider = createStaticComponent<
  ContextProviderProps,
  JSXContextProviderNode
>(({ assignments, children }) => {
  return {
    [nodeBrandKey]: true,
    nodeType: 'ContextProvider',
    assignments,
    children,
  };
});
