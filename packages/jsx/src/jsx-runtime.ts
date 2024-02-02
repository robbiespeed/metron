import {
  NODE_TYPE_COMPONENT,
  NODE_TYPE_INTRINSIC,
  IS_NODE,
  type Component,
  type JSXComponentNode,
  type JSXIntrinsicNode,
  createStaticComponent,
  type StaticComponent,
  type JSXProps,
  IS_STATIC_COMPONENT,
} from './node.js';

declare namespace JSX {
  interface IntrinsicElements {
    [tagName: string]: Record<string, unknown>;
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

function jsx(tag: JSX.ElementType, props: JSXProps): unknown {
  if (typeof tag === 'function') {
    if ((tag as any)[IS_STATIC_COMPONENT] === true) {
      return (tag as StaticComponent)(props);
    }
    return {
      [IS_NODE]: true,
      nodeType: NODE_TYPE_COMPONENT,
      props,
      tag,
    } satisfies JSXComponentNode;
  } else {
    return {
      [IS_NODE]: true,
      nodeType: NODE_TYPE_INTRINSIC,
      props,
      tag,
    } satisfies JSXIntrinsicNode;
  }
}

export { jsx, jsx as jsxs, jsx as jsxDEV, jsx as jsxsDEV };
