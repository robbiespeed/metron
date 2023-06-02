import { logger } from './env.js';
import {
  NODE_TYPE_COMPONENT,
  NODE_TYPE_INTRINSIC,
  nodeBrandKey,
  type ComponentFunction,
  type ComponentNode,
  type IntrinsicNode,
} from './node.js';

declare namespace JSX {
  interface IntrinsicElements {
    [tagName: string]: Record<string, unknown>;
  }

  interface IntrinsicAttributes {
    key?: {};
  }

  type ElementType = ComponentFunction<object> | string;

  type Element = unknown;
}

export type { JSX };

export const Fragment = () => {
  throw new Error('Fragment should never be called');
};

export function jsx(
  tag: ComponentFunction<object> | string,
  props: Record<string, unknown>,
  key?: {}
): unknown {
  if (tag === Fragment && key === undefined) {
    const { children } = props;

    return children;
  } else if (typeof tag === 'function') {
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
