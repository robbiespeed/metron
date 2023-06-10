import { createAtom, type AtomSetter } from '@metron/core/atom.js';
import { type Atom } from '@metron/core/particle.js';

export interface JsxBaseNode {
  readonly [nodeBrandKey]: true;
}

export interface JsxComponentNode extends JsxBaseNode {
  readonly nodeType: typeof NODE_TYPE_COMPONENT;
  readonly tag: Component;
  readonly props: JsxProps;
}

export interface JsxContextProviderNode extends JsxBaseNode {
  readonly nodeType: typeof NODE_TYPE_CONTEXT_PROVIDER;
  readonly contextStoreUpdate: ComponentContextStore;
  readonly children: unknown;
}

export interface JsxFragmentNode extends JsxBaseNode {
  readonly nodeType: typeof NODE_TYPE_FRAGMENT;
  readonly children: unknown;
}

export interface JsxIntrinsicNode extends JsxBaseNode {
  readonly nodeType: typeof NODE_TYPE_INTRINSIC;
  readonly props: JsxProps;
  readonly tag: string;
}

export interface JsxRenderContextNode extends JsxBaseNode {
  readonly nodeType: typeof NODE_TYPE_RENDER_CONTEXT;
  readonly renderContextKey: symbol;
  readonly children: unknown;
}

export type JsxNode =
  | JsxComponentNode
  | JsxContextProviderNode
  | JsxFragmentNode
  | JsxIntrinsicNode
  | JsxRenderContextNode;

export interface JsxProps {
  readonly [key: string]: unknown;
}

export interface ComponentContextStore {
  readonly [key: string]: unknown;
}

export interface Component<
  TProps extends JsxProps = JsxProps,
  TReturn = unknown
> {
  (props: TProps, context: ComponentContext): TReturn;
}

export interface StaticComponent<
  TProps extends JsxProps = JsxProps,
  TReturn extends JsxNode = JsxNode
> {
  (props: TProps): TReturn;
  [staticComponentBrandKey]: true;
}

// TODO: switch from atom to custom particle type without valueOf/untracked access
// users will need useContext to gain access to stored values
export interface ComponentContext extends Atom<ComponentContextStore> {
  [setContextKey]: AtomSetter<ComponentContextStore>;
}

export interface RenderContext<TRendered = unknown> {
  renderComponent(
    node: JsxComponentNode,
    contextStore: ComponentContextStore
  ): TRendered;
  renderFragment(
    node: JsxFragmentNode,
    contextStore: ComponentContextStore
  ): TRendered;
  renderIntrinsic(
    node: JsxIntrinsicNode,
    contextStore: ComponentContextStore
  ): TRendered;
  render(element: unknown, contextStore: ComponentContextStore): TRendered;
  // moveOther
  // moveComponent
  // moveIntrinsic
}

export const NODE_TYPE_COMPONENT = 'Component';
export const NODE_TYPE_CONTEXT_PROVIDER = 'ContextProvider';
export const NODE_TYPE_FRAGMENT = 'Fragment';
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

const staticComponentBrandKey = Symbol('MetronJSXStaticComponentBrand');

export function isStaticComponent(
  component: unknown
): component is StaticComponent {
  return (component as any)?.[staticComponentBrandKey] === true;
}

export function createStaticComponent<
  TProps extends JsxProps = JsxProps,
  TReturn extends JsxNode = JsxNode
>(
  component: (props: TProps, context?: undefined) => TReturn
): StaticComponent<TProps, TReturn> {
  (component as any)[staticComponentBrandKey] = true;
  return component as any;
}

const renderContextStore: Record<symbol, RenderContext | undefined> = {};

export function createRenderContext(
  renderContext: RenderContext
): StaticComponent<{ readonly children?: unknown }, JsxRenderContextNode> {
  const renderContextKey = Symbol();
  renderContextStore[renderContextKey] = renderContext;
  return createStaticComponent(({ children }) => ({
    [nodeBrandKey]: true,
    nodeType: NODE_TYPE_RENDER_CONTEXT,
    renderContextKey,
    children,
  }));
}

export function isJsxNode(maybeNode: unknown): maybeNode is JsxNode {
  return (maybeNode as any)?.[nodeBrandKey] === true;
}

type RenderReturnFromContext<TContext extends RenderContext> =
  TContext extends RenderContext<infer TReturn> ? TReturn : never;

export function renderNode<
  TRenderContext extends RenderContext = RenderContext,
  TReturn extends RenderReturnFromContext<TRenderContext> = RenderReturnFromContext<TRenderContext>
>(
  element: JsxNode,
  contextStore: ComponentContextStore = {},
  renderContext?: TRenderContext
): undefined | TReturn {
  let childContextStore = contextStore;
  switch (element.nodeType) {
    case NODE_TYPE_COMPONENT: {
      return renderContext?.renderComponent(element, contextStore) as TReturn;
    }
    case NODE_TYPE_FRAGMENT: {
      return renderContext?.renderFragment(element, contextStore) as TReturn;
    }
    case NODE_TYPE_INTRINSIC: {
      return renderContext?.renderIntrinsic(element, contextStore) as TReturn;
    }
    case NODE_TYPE_CONTEXT_PROVIDER: {
      childContextStore = {
        ...contextStore,
        ...element.contextStoreUpdate,
      };
      return renderContext?.render(
        element.children,
        childContextStore
      ) as TReturn;
    }
    case NODE_TYPE_RENDER_CONTEXT: {
      const renderContext = renderContextStore[element.renderContextKey];
      renderContext?.render(element.children, childContextStore);
      return;
    }
  }
}
