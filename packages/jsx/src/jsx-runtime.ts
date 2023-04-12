declare namespace JSX {
  interface IntrinsicElements {
    [tagName: string]: {
      [propName: string]: unknown;
    };
  }
  interface ElementChildrenAttribute {
    children: {}; // specify children name to use
  }
  interface IntrinsicAttributes {
    key?: {};
  }

  // TODO: Maybe avoid number to prevent unintended string representations?
  // Actually it seems better that the DOM lib handle by using number.toLocaleString()
  // type Element = Node | string | number | bigint | boolean | undefined;
  type Element = Node | undefined;

  // TODO:
  // Extract below to separate namespace to avoid conflict with future TS changes

  // type IntrinsicChild = Node | string | number | bigint | boolean;

  enum NodeType {
    Intrinsic,
    Component,
    ListComponent,
  }

  interface BaseNode {
    readonly type: NodeType;
  }

  type Node = IntrinsicNode | ComponentNode;

  interface IntrinsicNode {
    readonly tagName: string;
    readonly props: {
      readonly children?: readonly Node[];
    };
    // Ref extracted from props
    readonly children?: readonly Node[];
    readonly key?: {};
    parent?: Node;
  }

  interface ComponentNode {
    readonly component: ComponentFunction;
    readonly props: object;
    // Ref extracted from props
    readonly children?: readonly Node[];
    readonly key?: {};
    parent?: Node;
  }

  interface ComponentContext {}

  interface ComponentFunction {
    type?: NodeType.Component;
    (props: object, context: ComponentContext): Element;
  }

  interface ListComponentFunction {
    type: NodeType.ListComponent;
    (props: object, context: ComponentContext): Element[];
  }
}

export function jsx(
  tag: JSX.ComponentFunction | string,
  props: Record<string, unknown>,
  key?: {}
): JSX.Node {
  if (typeof tag === 'function') {
    const child = tag(props, {});
    return {
      component: tag,
      props,
      children: [],
      key,
    };
  } else {
    return {
      tagName: tag,
      props,
      children: [],
      key,
    };
  }
}

export type { JSX };
