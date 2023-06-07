import {
  NODE_TYPE_COMPONENT,
  NODE_TYPE_INTRINSIC,
  nodeBrandKey,
  type Component,
  type ComponentNode,
  type IntrinsicNode,
  type ContextlessComponent,
  createContextlessComponent,
  isContextlessComponent,
} from './node.js';

declare namespace JSX {
  interface IntrinsicElements {
    [tagName: string]: Record<string, unknown>;
  }

  interface IntrinsicAttributes {
    key?: {};
  }

  type ElementType = Component | string;

  type Element = unknown;
}

export type { JSX };

export const Fragment = createContextlessComponent(({ children }) => {
  return children;
});

export function jsx(
  tag: Component | ContextlessComponent | string,
  props: Record<string, unknown>,
  key?: {}
): unknown {
  if (typeof tag === 'function') {
    if (isContextlessComponent(tag)) {
      return props.children;
    }
    return {
      [nodeBrandKey]: true,
      key,
      nodeType: NODE_TYPE_COMPONENT,
      props,
      tag,
    } satisfies ComponentNode;
  } else {
    return {
      [nodeBrandKey]: true,
      key,
      nodeType: NODE_TYPE_INTRINSIC,
      props,
      tag,
    } satisfies IntrinsicNode;
  }
}

export const jsxs = jsx;
