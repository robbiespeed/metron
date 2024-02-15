import type { Disposer } from '@metron/core/shared.js';
import type { JSXContext, ContextProviderProps } from './context.js';

export interface JSXBaseNode {
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

// TODO: maybe if render logic is determined via context this could be converted to a advanced node
export interface JSXContextProviderNode extends JSXBaseNode {
  readonly nodeType: typeof NODE_TYPE_CONTEXT_PROVIDER;
  readonly tag: undefined;
  readonly props: ContextProviderProps;
}

export interface JSXAdvancedNode<
  TProps extends JSXProps = JSXProps,
  TChild = any,
  TParent = any
> extends JSXBaseNode {
  readonly nodeType: typeof NODE_TYPE_ADVANCED;
  readonly tag: JSXRenderFn<TProps, TChild, TParent>;
  readonly props: TProps;
}

export type JSXNode =
  | JSXIntrinsicNode
  | JSXComponentNode
  | JSXContextProviderNode
  | JSXAdvancedNode;

export type JSXProps = {};

export type Register = (dispose: Disposer) => void;

export interface Component<
  TProps extends JSXProps = JSXProps,
  TReturn = unknown
> {
  (props: TProps, context: JSXContext, register: Register): TReturn;
}

export interface StaticComponent<
  TProps extends JSXProps = JSXProps,
  TReturn = unknown
> {
  (props: TProps): TReturn;
  [IS_STATIC_COMPONENT]: true;
}

export interface JSXRenderFn<
  TValue = unknown,
  TChild = unknown,
  TParent = unknown
> {
  (
    value: TValue,
    context: JSXContext,
    register: Register,
    append: (child: TChild) => void,
    parent: TParent
  ): undefined;
}

export const NODE_TYPE_INTRINSIC = 0;
export const NODE_TYPE_COMPONENT = 1;
export const NODE_TYPE_CONTEXT_PROVIDER = 2;
export const NODE_TYPE_ADVANCED = 3;

export const IS_NODE = Symbol('MetronJSXNodeBrand');

export const IS_STATIC_COMPONENT = Symbol('MetronJSXStaticComponentBrand');

export function isStaticComponent(
  component: unknown
): component is StaticComponent {
  return (component as any)[IS_STATIC_COMPONENT] === true;
}

export function createStaticComponent<
  TProps extends JSXProps = JSXProps,
  TReturn = unknown
>(
  component: (props: TProps, context?: undefined) => TReturn
): StaticComponent<TProps, TReturn> {
  (component as any)[IS_STATIC_COMPONENT] = true;
  return component as any;
}

export function isJSXNode(maybeNode: {}): maybeNode is JSXNode {
  return (maybeNode as { [IS_NODE]?: unknown })?.[IS_NODE] === true;
}
