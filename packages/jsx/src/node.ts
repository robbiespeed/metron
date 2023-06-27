import { createAtom } from '@metron/core/atom.js';
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

export interface JsxRawNode extends JsxBaseNode {
  readonly nodeType: typeof NODE_TYPE_RAW;
  readonly value: unknown;
  readonly disposer?: () => void;
}

export interface JsxRenderContextNode extends JsxBaseNode {
  readonly nodeType: typeof NODE_TYPE_RENDER_CONTEXT;
  readonly renderContextKey: symbol;
  readonly props: JsxProps;
}

export type JsxNode =
  | JsxComponentNode
  | JsxContextProviderNode
  | JsxFragmentNode
  | JsxIntrinsicNode
  | JsxRawNode
  | JsxRenderContextNode;

// export interface JsxProps {
//   readonly [key: string]: unknown;
// }
export type JsxProps = Record<string, unknown>;

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
export interface ComponentContext extends Atom<ComponentContextStore> {}

export interface RenderContext<
  TRootProps extends JsxProps = JsxProps,
  TRendered = unknown
> {
  renderRoot(props: TRootProps, contextStore: ComponentContextStore): TRendered;
  renderComponent(
    node: JsxComponentNode,
    contextStore: ComponentContextStore,
    isOnlyChild: boolean
  ): TRendered;
  renderFragment(
    node: JsxFragmentNode,
    contextStore: ComponentContextStore,
    isOnlyChild: boolean
  ): TRendered;
  renderIntrinsic(
    node: JsxIntrinsicNode,
    contextStore: ComponentContextStore,
    isOnlyChild: boolean
  ): TRendered;
  renderUnknown(
    element: unknown,
    contextStore: ComponentContextStore,
    isOnlyChild: boolean
  ): TRendered;
  // moveOther
  // moveComponent
  // moveIntrinsic
}

export const NODE_TYPE_COMPONENT = 'Component';
export const NODE_TYPE_CONTEXT_PROVIDER = 'ContextProvider';
export const NODE_TYPE_FRAGMENT = 'Fragment';
export const NODE_TYPE_INTRINSIC = 'Intrinsic';
export const NODE_TYPE_RAW = 'Raw';
export const NODE_TYPE_RENDER_CONTEXT = 'RenderContext';

export const nodeBrandKey = Symbol('MetronJSXNodeBrand');

export function createContext(
  record: ComponentContextStore = {}
): ComponentContext {
  const [context] = createAtom(record);
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

// TODO refactor render context to account for disposers or remove and rely on Raw nodes for switching renderers
const renderContextStore: Record<symbol, RenderContext | undefined> = {};

type RenderReturnFromContext<TContext extends RenderContext> =
  TContext extends RenderContext<any, infer TReturn> ? TReturn : never;

type RenderRootPropsFromContext<TContext extends RenderContext> =
  TContext extends RenderContext<infer TProps> ? TProps : never;

export function createRenderContext<TContext extends RenderContext>(
  renderContext: TContext
): StaticComponent<RenderRootPropsFromContext<TContext>, JsxRenderContextNode> {
  const renderContextKey = Symbol();
  renderContextStore[renderContextKey] = renderContext;
  return createStaticComponent((props) => ({
    [nodeBrandKey]: true,
    nodeType: NODE_TYPE_RENDER_CONTEXT,
    renderContextKey,
    props,
  }));
}

export function isJsxNode(maybeNode: unknown): maybeNode is JsxNode {
  return (maybeNode as any)?.[nodeBrandKey] === true;
}

export function renderNode<
  TRenderContext extends RenderContext = RenderContext,
  TReturn extends RenderReturnFromContext<TRenderContext> = RenderReturnFromContext<TRenderContext>
>(
  element: JsxNode,
  contextStore: ComponentContextStore = {},
  renderContext?: TRenderContext,
  isOnlyChild = false
): undefined | TReturn {
  let childContextStore = contextStore;
  switch (element.nodeType) {
    case NODE_TYPE_COMPONENT: {
      return renderContext?.renderComponent(
        element,
        contextStore,
        isOnlyChild
      ) as TReturn;
    }
    case NODE_TYPE_FRAGMENT: {
      return renderContext?.renderFragment(
        element,
        contextStore,
        isOnlyChild
      ) as TReturn;
    }
    case NODE_TYPE_INTRINSIC: {
      return renderContext?.renderIntrinsic(
        element,
        contextStore,
        isOnlyChild
      ) as TReturn;
    }
    case NODE_TYPE_CONTEXT_PROVIDER: {
      childContextStore = {
        ...contextStore,
        ...element.contextStoreUpdate,
      };
      return renderContext?.renderUnknown(
        element.children,
        childContextStore,
        isOnlyChild
      ) as TReturn;
    }
    case NODE_TYPE_RENDER_CONTEXT: {
      renderContextStore[element.renderContextKey]?.renderRoot(
        element.props,
        childContextStore
      );
      return;
    }
  }
}
