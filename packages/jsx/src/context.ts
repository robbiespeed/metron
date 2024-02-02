import {
  createStaticComponent,
  IS_NODE,
  NODE_TYPE_CONTEXT_PROVIDER,
  type JSXContextProviderNode,
} from './node.js';

export interface JSXContextStore {
  [stateKey: symbol]: unknown;
}

export interface JSXContext {
  [contextInternalsKey]: Partial<JSXContextStore>;
  use: <T extends symbol>(stateKey: T) => JSXContextStore[T] | undefined;
}
const contextInternalsKey = Symbol('MetronJSXContextInternals');

export function createRootContext(
  assignments?: Partial<JSXContextStore>
): JSXContext {
  const internalState: Partial<JSXContextStore> = { ...assignments };

  const context: JSXContext = {
    [contextInternalsKey]: internalState,
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
    use: (stateKey) => internalState[stateKey],
  };
}

export interface ContextProviderProps {
  assignments: Partial<JSXContextStore>;
  children?: unknown;
}

export const ContextProvider = createStaticComponent<
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
