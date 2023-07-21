import {
  NODE_TYPE_COMPONENT,
  NODE_TYPE_INTRINSIC,
  nodeBrandKey,
  type Component,
  type JSXComponentNode,
  type JSXIntrinsicNode,
  createStaticComponent,
  type StaticComponent,
  isStaticComponent,
  type JSXProps,
} from './node.js';

declare namespace JSX {
  interface IntrinsicElements {
    [tagName: string]: JSXProps;
  }

  interface IntrinsicAttributes {}

  interface ElementChildrenAttribute {
    children: {}; // specify children name to use
  }

  type ElementType<TProps = unknown> =
    // JSX won't function unless any is the fallback type for TProps
    | Component<TProps extends JSXProps ? TProps : any>
    | StaticComponent<TProps extends JSXProps ? TProps : any>
    | string;

  type Element = unknown;
}

export type { JSX };

export const Fragment = createStaticComponent<{ children?: unknown[] }>(
  ({ children }) => {
    return children;
  }
);

export type PropsFromTag<TTag extends JSX.ElementType> = TTag extends string
  ? JSX.IntrinsicElements[TTag]
  : TTag extends (props: infer TProps) => unknown
  ? TProps
  : never;

export function jsx(tag: JSX.ElementType, props: JSXProps): unknown {
  if (typeof tag === 'function') {
    if (isStaticComponent(tag)) {
      return tag(props);
    }
    return {
      [nodeBrandKey]: true,
      nodeType: NODE_TYPE_COMPONENT,
      props,
      tag,
    } satisfies JSXComponentNode;
  } else {
    return {
      [nodeBrandKey]: true,
      nodeType: NODE_TYPE_INTRINSIC,
      props,
      tag,
    } satisfies JSXIntrinsicNode;
  }
}

export const jsxs = jsx;
