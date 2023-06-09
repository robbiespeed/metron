import {
  NODE_TYPE_COMPONENT,
  NODE_TYPE_INTRINSIC,
  nodeBrandKey,
  type Component,
  type JsxComponentNode,
  type JsxIntrinsicNode,
  createStaticComponent,
  type StaticComponent,
  isStaticComponent,
  type JsxNodeProps,
  NODE_TYPE_FRAGMENT,
  type JsxNode,
} from './node.js';

declare namespace JSX {
  interface IntrinsicElements {
    [tagName: string]: JsxNodeProps;
  }

  interface IntrinsicAttributes {}

  type ElementType = Component | StaticComponent | string;

  type Element = unknown;
}

export type { JSX };

export const Fragment = createStaticComponent(({ children }) => {
  return {
    [nodeBrandKey]: true,
    nodeType: NODE_TYPE_FRAGMENT,
    children,
  } as const;
});

export type PropsFromTag<TTag extends JSX.ElementType> = TTag extends string
  ? JSX.IntrinsicElements[TTag]
  : TTag extends (props: infer TProps) => unknown
  ? TProps
  : never;

export function jsx(
  tag: JSX.ElementType,
  props: JsxNodeProps,
  key?: undefined
): JsxNode {
  if (typeof tag === 'function') {
    if (isStaticComponent(tag)) {
      return tag(props);
    }
    return {
      [nodeBrandKey]: true,
      nodeType: NODE_TYPE_COMPONENT,
      props,
      tag,
    } satisfies JsxComponentNode;
  } else {
    return {
      [nodeBrandKey]: true,
      nodeType: NODE_TYPE_INTRINSIC,
      props,
      tag,
    } satisfies JsxIntrinsicNode;
  }
}

export const jsxs = jsx;
