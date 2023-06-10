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
  type JsxProps,
  NODE_TYPE_FRAGMENT,
  type JsxNode,
} from './node.js';

declare namespace JSX {
  interface IntrinsicElements {
    [tagName: string]: JsxProps;
  }

  interface IntrinsicAttributes {}

  type ElementType<TProps = unknown> =
    // Jsx won't function unless any is the fallback type for TProps
    | Component<TProps extends JsxProps ? TProps : any>
    | StaticComponent<TProps extends JsxProps ? TProps : any>
    | string;

  type Element = JsxNode;
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
  props: JsxProps,
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
