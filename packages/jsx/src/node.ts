import { createAtom, type AtomSetter } from '@metron/core/atom.js';
import { type Atom } from '@metron/core/particle.js';

export interface BaseNode {
  readonly [nodeBrandKey]: true;
  readonly key?: {};
}

export interface ComponentNode extends BaseNode {
  readonly nodeType: typeof NODE_TYPE_COMPONENT;
  readonly tag: Component;
  readonly props: NodeProps;
}

export interface ContextProviderNode extends BaseNode {
  readonly nodeType: typeof NODE_TYPE_CONTEXT_PROVIDER;
  readonly contextStoreUpdate: ComponentContextStore;
  readonly children: unknown;
}

export interface IntrinsicNode extends BaseNode {
  readonly nodeType: typeof NODE_TYPE_INTRINSIC;
  readonly props: NodeProps;
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

export interface NodeProps {
  readonly [key: string]: unknown;
}

export interface ComponentContextStore {
  readonly [key: string]: unknown;
}

export interface Component<
  TProps extends NodeProps = NodeProps,
  TReturn = unknown
> {
  (props: TProps, context: ComponentContext): TReturn;
}

export interface ContextlessComponent<
  TProps extends NodeProps = NodeProps,
  TReturn = unknown
> {
  (props: TProps, context?: undefined): TReturn;
  [contextlessComponentBrandKey]: true;
}

// TODO: switch from atom to custom particle type without valueOf/untracked access
// users will need useContext to gain access to stored values
export interface ComponentContext extends Atom<ComponentContextStore> {
  [setContextKey]: AtomSetter<ComponentContextStore>;
}

export interface RenderContext<TRendered = unknown> {
  renderComponent(
    node: ComponentNode,
    contextStore: ComponentContextStore
  ): TRendered;
  // renderKeyedFragment (element: ComponentNode, contextStore: ComponentContextStore): unknown;
  renderIntrinsic(
    node: IntrinsicNode,
    contextStore: ComponentContextStore
  ): TRendered;
  render(element: unknown, contextStore: ComponentContextStore): TRendered;
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

const contextlessComponentBrandKey = Symbol(
  'MetronJSXContextlessComponentBrand'
);

export function createContextlessComponent<
  TProps extends NodeProps,
  TReturn = unknown
>(
  component: (props: TProps, context?: undefined) => TReturn
): ContextlessComponent<TProps, TReturn> {
  (component as ContextlessComponent)[contextlessComponentBrandKey] = true;
  return component as ContextlessComponent<TProps, TReturn>;
}

export function isContextlessComponent(
  component: unknown
): component is ContextlessComponent {
  return (component as any)?.[contextlessComponentBrandKey] === true;
}

const renderContextStore: Record<symbol, RenderContext | undefined> = {};

export function createRenderContext(
  renderContext: RenderContext
): ContextlessComponent<{ readonly children?: unknown }, RenderContextNode> {
  const renderContextKey = Symbol();
  renderContextStore[renderContextKey] = renderContext;
  return createContextlessComponent(({ children }) => ({
    [nodeBrandKey]: true,
    nodeType: NODE_TYPE_RENDER_CONTEXT,
    renderContextKey,
    children,
  }));
}

export function isNode(maybeNode: unknown): maybeNode is Node {
  return (maybeNode as any)?.[nodeBrandKey] === true;
}

export function renderNode<
  TRendered = unknown,
  TRenderContext extends RenderContext<TRendered> = RenderContext<TRendered>
>(
  element: Node,
  contextStore: ComponentContextStore = {},
  renderContext?: TRenderContext
): undefined | TRendered {
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
      return renderContext?.render(element.children, childContextStore);
    }
    case NODE_TYPE_RENDER_CONTEXT: {
      const renderContext = renderContextStore[element.renderContextKey];
      renderContext?.render(element.children, childContextStore);
      return;
    }
  }
}
