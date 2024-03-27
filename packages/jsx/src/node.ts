import type { Context } from './context.js';

export interface JSXBaseNode {
  // TODO remove IS_NODE and nodeType and replace with NODE_TYPE symbol
  readonly [IS_NODE]: true;
  readonly nodeType: number;
  readonly tag: unknown;
  readonly props: JSXProps;
}

export interface JSXIntrinsicNode extends JSXBaseNode {
  readonly nodeType: typeof NODE_TYPE_INTRINSIC;
  readonly tag: string;
  readonly props: JSXProps;
}

export interface JSXComponentNode extends JSXBaseNode {
  readonly nodeType: typeof NODE_TYPE_COMPONENT;
  readonly tag: Component;
  readonly props: JSXProps;
}

export interface JSXUnsafeNode<TProps extends JSXProps = JSXProps>
  extends JSXBaseNode {
  readonly nodeType: typeof NODE_TYPE_UNSAFE;
  readonly tag: RenderFn<TProps>;
  readonly props: TProps;
}

export type RenderFn<TProps extends {} = {}> = (
  props: TProps,
  context: Context,
  ...rest: unknown[]
) => undefined;

export type JSXNode = JSXIntrinsicNode | JSXComponentNode | JSXUnsafeNode;

export type JSXProps = {};

export interface Component<
  TProps extends JSXProps = JSXProps,
  TReturn = unknown
> {
  (props: TProps, context: Context): TReturn;
}

export interface StaticComponent<
  TProps extends JSXProps = JSXProps,
  TReturn = unknown
> {
  (props: TProps): TReturn;
  [IS_STATIC_COMPONENT]: true;
}

export const NODE_TYPE_INTRINSIC = 0;
export const NODE_TYPE_COMPONENT = 1;
export const NODE_TYPE_UNSAFE = 2;

export const IS_NODE = Symbol('MetronJSXNodeBrand');

export const IS_STATIC_COMPONENT = Symbol('MetronJSXStaticComponentBrand');

export function isStaticComponent(
  component: unknown
): component is StaticComponent {
  return (component as any)[IS_STATIC_COMPONENT] === true;
}

export function convertToStaticComponent<
  TProps extends JSXProps = JSXProps,
  TReturn = unknown
>(render: (props: TProps) => TReturn) {
  (render as StaticComponent)[IS_STATIC_COMPONENT] = true;
  return render;
}

export function isJSXNode(maybeNode: {}): maybeNode is JSXNode {
  return (maybeNode as { [IS_NODE]?: unknown })?.[IS_NODE] === true;
}
