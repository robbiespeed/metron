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

  enum NodeTagType {
    Intrinsic,
    Fragment,
    Component,
    ListComponent,
  }

  enum NodeType {
    Branch,
    UnaryBranch,
    Leaf,
  }

  interface BaseNode {
    // parent?: Node;
    readonly key?: {};
  }

  interface UnaryBranchNode {
    readonly type: NodeType.UnaryBranch;
    readonly child: Node;
  }

  interface BranchNode {
    readonly type: NodeType.Branch;
    readonly children: readonly Node[];
  }

  interface LeafNode {
    readonly type: NodeType.Leaf;
  }

  interface FragmentNode extends BaseNode {
    readonly tagType: NodeTagType.Fragment;
  }

  interface IntrinsicNode extends BaseNode {
    readonly tagType: NodeTagType.Intrinsic;
    readonly tag: string;
  }

  interface ComponentNode extends BaseNode {
    readonly tagType: NodeTagType.Component;
    readonly tag: ComponentFunction;
  }

  interface ListComponentNode extends BaseNode, BranchNode {
    readonly tagType: NodeTagType.ListComponent;
    readonly tag: ListComponentFunction;
  }

  interface BranchFragmentNode extends BranchNode, FragmentNode {}
  interface BranchComponentNode extends BranchNode, ComponentNode {}
  interface BranchIntrinsicNode extends BranchNode, IntrinsicNode {}
  interface LeafFragmentNode extends LeafNode, FragmentNode {}
  interface LeafComponentNode extends LeafNode, ComponentNode {}
  interface LeafIntrinsicNode extends LeafNode, IntrinsicNode {}
  interface UnaryBranchFragmentNode extends UnaryBranchNode, FragmentNode {}
  interface UnaryBranchComponentNode extends UnaryBranchNode, ComponentNode {}
  interface UnaryBranchIntrinsicNode extends UnaryBranchNode, IntrinsicNode {}

  type Node =
    | ListComponentNode
    | BranchFragmentNode
    | BranchComponentNode
    | BranchIntrinsicNode
    | LeafFragmentNode
    | LeafComponentNode
    | LeafIntrinsicNode
    | UnaryBranchFragmentNode
    | UnaryBranchComponentNode
    | UnaryBranchIntrinsicNode;

  interface ComponentContext {}

  interface ComponentFunction {
    type?: NodeTagType.Component;
    (props: object, context: ComponentContext): Element;
  }

  interface ListComponentFunction {
    type: NodeTagType.ListComponent;
    (props: object, context: ComponentContext): Element[];
  }
}

export const Fragment = Symbol('Fragment');

export function jsx(
  tag: JSX.ComponentFunction | string | typeof Fragment,
  props: Record<string, unknown>,
  key?: {}
): JSX.Node {
  if (tag === Fragment) {
    const { children } = props;

    if (children === undefined) {
      return {
        type: JSX.NodeType.Leaf as const,
        tagType: JSX.NodeTagType.Fragment as const,
        key,
      };
    }

    return {
      tagType: JSX.NodeTagType.Fragment as const,
      children: [],
      key,
    };
  } else if (typeof tag === 'function') {
    const element = tag(props, {});

    if (element === undefined) {
      return {
        type: JSX.NodeType.Leaf as const,
        tagType: JSX.NodeTagType.Component as const,
        tag,
        key,
      };
    }

    if (element.tagType === JSX.NodeTagType.Fragment) {
      return {
        ...element,
        tagType: JSX.NodeTagType.Component as const,
        tag,
        key,
      };
    }

    return {
      type: JSX.NodeType.UnaryBranch as const,
      tagType: JSX.NodeTagType.Component as const,
      child: element,
      tag,
      key,
    };
  } else {
    return {
      tagType: JSX.NodeTagType.Intrinsic as const,
      tag,
      children: [],
      key,
    };
  }
}

export type { JSX };
