const nodeBrandKey = Symbol('nodeBrandKey');

enum NodeTagType {
  ContextProvider,
  Intrinsic,
  Fragment,
  Component,
  ListComponent,
}

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
  interface ElementClass {
    contextStore: Record<string, unknown>;
  }

  // TODO: Maybe avoid number to prevent unintended string representations?
  // Actually it seems better that the DOM lib handle by using number.toLocaleString()
  // type Element = Node | string | number | bigint | boolean | undefined;
  type Element = Node | undefined;

  // TODO:
  // Extract below to separate namespace to avoid conflict with future TS changes

  interface BaseNode {
    // parent?: Node;
    [nodeBrandKey]: true;
    readonly key?: {};
    readonly children?: unknown;
  }

  interface ContextProviderNode extends BaseNode {
    readonly tagType: NodeTagType.ContextProvider;
    readonly tag: ContextProvider;
    readonly value: unknown;
  }

  interface FragmentNode extends BaseNode {
    readonly tagType: NodeTagType.Fragment;
  }

  interface IntrinsicNode extends BaseNode {
    readonly tagType: NodeTagType.Intrinsic;
    readonly tag: string;
    readonly props: object;
  }

  interface ComponentNode extends BaseNode {
    readonly tagType: NodeTagType.Component;
    readonly tag: ComponentFunction;
    readonly props: object;
  }

  // interface ListComponentNode extends BaseNode {
  //   readonly tagType: NodeTagType.ListComponent;
  //   readonly tag: ListComponentFunction;
  // }

  type Node =
    | FragmentNode
    | IntrinsicNode
    | ComponentNode
    | ContextProviderNode;

  interface ComponentContext {
    [key: string]: unknown;
  }

  interface ContextProvider {
    isProvider: true;
    id: string;
  }

  interface ComponentFunction {
    type?: NodeTagType.Component;
    (props: object, context: ComponentContext): Element;
  }

  interface ListComponentFunction {
    type: NodeTagType.ListComponent;
    (props: object, context: ComponentContext): Element[];
  }
}

// TODO: define args, have an ID, message, err (optional on warn, required on error)
export interface Logger {
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
}

let logger: Logger | undefined = undefined;

// TODO: Logger for dev mode should have opt-in to send metrics to central server for analysis

export function setLogger(logger: Logger) {
  logger = logger;
}

export const Fragment = Symbol('Fragment');

export function jsx(
  tag: JSX.ComponentFunction | string | typeof Fragment | JSX.ContextProvider,
  props: Record<string, unknown>,
  key?: {}
): JSX.Node {
  if (tag === Fragment) {
    const { children } = props;

    if (
      logger &&
      isNode(children) &&
      children.tagType === NodeTagType.Fragment
    ) {
      logger.warn?.(
        'A Fragment child will not flatten when inside another Fragment'
      );
    }

    return {
      [nodeBrandKey]: true,
      tagType: NodeTagType.Fragment,
      children,
      key,
    };
  } else if (typeof tag === 'function') {
    return {
      [nodeBrandKey]: true,
      tagType: NodeTagType.Component,
      props,
      tag,
      key,
    };
  } else if (typeof tag === 'string') {
    const { children } = props;

    if (
      logger &&
      isNode(children) &&
      children.tagType === NodeTagType.Fragment
    ) {
      logger.warn?.(
        'A Fragment child will not flatten when inside jsx literals'
      );
    }

    return {
      [nodeBrandKey]: true,
      tagType: NodeTagType.Intrinsic,
      tag,
      props,
      children,
      key,
    };
  } else {
    const { children, value } = props;

    if (
      logger &&
      isNode(children) &&
      children.tagType === NodeTagType.Fragment
    ) {
      logger.warn?.(
        'A Fragment child will not flatten when inside a Context Provider'
      );
    }

    return {
      [nodeBrandKey]: true,
      tagType: NodeTagType.ContextProvider,
      tag,
      children,
      value,
      key,
    };
  }
}

interface WritableNode extends JSX.BaseNode {
  children?: unknown;
}

export function isNode(node: unknown): node is JSX.Node {
  // return typeof node === 'object' && node !== null && nodeBrandKey in node;
  return typeof node === 'object' && node !== null && 'tagType' in node;
}

export function updateNodeContext(
  node: JSX.Node,
  context: JSX.ComponentContext
) {
  // When a component node and children have not been set the component must be initialized
  if (node.tagType === NodeTagType.Component && 'children' in node) {
    const { tag, props } = node;
    const child = tag(props, context);
    if (isNode(child) && child.tagType === NodeTagType.Fragment) {
      (node as WritableNode).children = child.children;
    } else {
      (node as WritableNode).children = child;
    }
  }
  // TODO: Add support for pre update hook

  let nextContext = context;

  if (node.tagType === NodeTagType.ContextProvider) {
    const { tag, value } = node;
    nextContext = { ...context, [tag.id]: value };
  }

  const { children } = node;
  if (children) {
    if (Array.isArray(children)) {
      for (const child of children) {
        if (isNode(child)) {
          updateNodeContext(child, nextContext);
        }
      }
    } else if (isNode(children)) {
      updateNodeContext(children, nextContext);
    }
  }

  // TODO: Add support for post update hook
}

// TODO:
// isActive flag may not be necessary
// deactivateNode needed for deactivation hooks
// function deactivateNode(node: JSX.Node) {
//   const { children } = node;
//   if (children) {
//     if (Array.isArray(children)) {
//       for (const child of children) {
//         if (isNode(child)) {
//           deactivateNode(child);
//         }
//       }
//     } else if (isNode(children)) {
//       deactivateNode(children);
//     }
//   }
//   node.isActive = false;
// }

export type { JSX };
