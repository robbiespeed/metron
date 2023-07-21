import type { JSXContextStore, JSXContext } from './context.js';

export interface JSXBaseNode {
  readonly [nodeBrandKey]: true;
}

export interface JSXComponentNode extends JSXBaseNode {
  readonly nodeType: typeof NODE_TYPE_COMPONENT;
  readonly tag: Component;
  readonly props: JSXProps;
}

export interface JSXContextProviderNode extends JSXBaseNode {
  readonly nodeType: typeof NODE_TYPE_CONTEXT_PROVIDER;
  readonly assignments: Partial<JSXContextStore>;
  readonly children: unknown;
}

export interface JSXIntrinsicNode extends JSXBaseNode {
  readonly nodeType: typeof NODE_TYPE_INTRINSIC;
  readonly props: JSXProps;
  readonly tag: string;
}

export type JSXNode =
  | JSXComponentNode
  | JSXContextProviderNode
  | JSXIntrinsicNode;

export type JSXProps = {};

export interface Component<
  TProps extends JSXProps = JSXProps,
  TReturn = unknown
> {
  (props: TProps, context: JSXContext): TReturn;
}

export interface StaticComponent<
  TProps extends JSXProps = JSXProps,
  TReturn = unknown
> {
  (props: TProps): TReturn;
  [staticComponentBrandKey]: true;
}

export const NODE_TYPE_COMPONENT = 'Component';
export const NODE_TYPE_CONTEXT_PROVIDER = 'ContextProvider';
export const NODE_TYPE_FRAGMENT = 'Fragment';
export const NODE_TYPE_INTRINSIC = 'Intrinsic';

export const nodeBrandKey = Symbol('MetronJSXNodeBrand');

const staticComponentBrandKey = Symbol('MetronJSXStaticComponentBrand');

export function isStaticComponent(
  component: unknown
): component is StaticComponent {
  return (component as any)?.[staticComponentBrandKey] === true;
}

export function createStaticComponent<
  TProps extends JSXProps = JSXProps,
  TReturn = unknown
>(
  component: (props: TProps, context?: undefined) => TReturn
): StaticComponent<TProps, TReturn> {
  (component as any)[staticComponentBrandKey] = true;
  return component as any;
}

export function isJSXNode(maybeNode: unknown): maybeNode is JSXNode {
  return (maybeNode as any)?.[nodeBrandKey] === true;
}
