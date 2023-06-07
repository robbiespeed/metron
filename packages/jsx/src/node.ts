import { createAtom, type AtomSetter } from '@metron/core/atom.js';
import { type Atom } from '@metron/core/particle.js';

export interface BaseNode {
  readonly [nodeBrandKey]: true;
  readonly key?: {};
}

export interface ComponentNode extends BaseNode {
  readonly nodeType: typeof NODE_TYPE_COMPONENT;
  readonly tag: ComponentFunction;
  readonly props: ReadonlyUnknownRecord;
}

export interface ContextProviderNode extends BaseNode {
  readonly nodeType: typeof NODE_TYPE_CONTEXT_PROVIDER;
  readonly contextStoreUpdate: ComponentContextStore;
  readonly children: unknown;
}

export interface IntrinsicNode extends BaseNode {
  readonly nodeType: typeof NODE_TYPE_INTRINSIC;
  readonly props: ReadonlyUnknownRecord;
  readonly tag: string;
}

export interface RenderContextNode extends BaseNode {
  readonly nodeType: typeof NODE_TYPE_RENDER_CONTEXT;
  readonly renderContextKey: symbol;
  readonly children: unknown;
}

export type Node =
  | ComponentNode
  | ContextProviderNode
  | IntrinsicNode
  | RenderContextNode;

export interface ReadonlyUnknownRecord {
  readonly [key: string]: unknown;
}

export type ComponentContextStore = ReadonlyUnknownRecord;

export interface ComponentFunction<Props = ReadonlyUnknownRecord> {
  (props: Props, context: ComponentContext): unknown;
}

// TODO: switch from atom to custom particle type without valueOf/untracked access
// users will need useContext to gain access to stored values
export interface ComponentContext extends Atom<ComponentContextStore> {
  [setContextKey]: AtomSetter<ComponentContextStore>;
}

export interface RenderContext {
  renderComponent(
    node: ComponentNode,
    contextStore: ComponentContextStore
  ): unknown;
  // renderKeyedFragment (element: ComponentNode, contextStore: ComponentContextStore): unknown;
  renderIntrinsic(
    node: IntrinsicNode,
    contextStore: ComponentContextStore
  ): unknown;
  renderOther(element: unknown, contextStore: ComponentContextStore): unknown;
  // moveOther
  // moveComponent
  // moveIntrinsic
}

export const NODE_TYPE_COMPONENT = 'Component';
export const NODE_TYPE_CONTEXT_PROVIDER = 'ContextProvider';
export const NODE_TYPE_INTRINSIC = 'Intrinsic';
export const NODE_TYPE_RENDER_CONTEXT = 'RenderContext';

export const nodeBrandKey = Symbol('MetronJSXNodeBrand');

const setContextKey = Symbol('MetronJSXSetContext');

export function createContext(
  record: ComponentContextStore = {}
): ComponentContext {
  const [context, setContext] = createAtom(record);
  (context as ComponentContext)[setContextKey] = setContext;
  return context as ComponentContext;
}

const renderContextStore: Record<symbol, RenderContext | undefined> = {};

export function isNode(maybeNode: unknown): maybeNode is Node {
  return (maybeNode as any)?.[nodeBrandKey] === true;
}

export function render(
  element: unknown,
  contextStore: ComponentContextStore = {},
  renderContext?: RenderContext
): unknown {
  if (!isNode(element)) {
    return renderContext?.renderOther(element, contextStore);
  }

  let childContextStore = contextStore;
  switch (element.nodeType) {
    case NODE_TYPE_COMPONENT: {
      return renderContext?.renderComponent(element, contextStore);
    }
    case NODE_TYPE_INTRINSIC: {
      return renderContext?.renderIntrinsic(element, contextStore);
    }
    case NODE_TYPE_CONTEXT_PROVIDER: {
      childContextStore = {
        ...contextStore,
        ...element.contextStoreUpdate,
      };
      return render(element.children, childContextStore, renderContext);
    }
    case NODE_TYPE_RENDER_CONTEXT: {
      renderContext = renderContextStore[element.renderContextKey];
      return render(element.children, childContextStore, renderContext);
    }
  }
}
