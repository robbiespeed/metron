const nodeBrandKey = Symbol('nodeBrandKey');

enum NodeType {
  Intrinsic,
  Fragment,
  Context,
  Component,
}

declare namespace JSX {
  interface IntrinsicElements {
    [tagName: string]: {};
  }
  // interface ElementChildrenAttribute {
  //   children: {}; // specify children name to use
  // }
  interface IntrinsicAttributes {
    key?: {};
  }

  type ElementType = ComponentFunction<any> | string;

  // TODO: Maybe avoid number to prevent unintended string representations?
  // Actually it seems better that the DOM lib handle by using number.toLocaleString()
  // type Element = Node | string | number | bigint | boolean | undefined;
  type Element = Node;

  // TODO:
  // Extract below to separate namespace to avoid conflict with future TS changes

  // interface ElementProps {
  //   readonly [key: string | number | symbol]: unknown;
  // }

  // TODO: turn these into classes and convert nodeBrandKey to a #branded = true
  // Then use Node.isNode() instead of isNode
  interface BaseNode {
    readonly nodeType: NodeType;
    readonly isInitialized: boolean;
    readonly key?: {};
    readonly children?: unknown;
  }

  type FragmentCreateChildContext = (
    tag: string,
    props: object,
    parentContext: ComponentContext
  ) => ComponentContext;

  interface ContextNode extends BaseNode {
    readonly nodeType: NodeType.Context;
    readonly contextUpdate: ComponentContext;
  }

  interface FragmentNode extends BaseNode {
    readonly nodeType: NodeType.Fragment;
  }

  type IntrinsicCreateChildContext = (
    node: IntrinsicNode,
    parentContext: ComponentContext
  ) => ComponentContext;

  interface IntrinsicNode extends BaseNode {
    readonly nodeType: NodeType.Intrinsic;
    readonly props: object;
    readonly tag: string;
  }

  interface ComponentNode extends BaseNode {
    readonly nodeType: NodeType.Component;
    readonly tag: ComponentFunction<object>;
    readonly props: object;
  }

  type Node = ContextNode | FragmentNode | IntrinsicNode | ComponentNode;

  interface ComponentContext {
    readonly [key: string]: unknown;
  }

  interface ComponentFunction<Props> {
    (props: Props, context: ComponentContext): Element | Element[] | undefined;
  }
}

enum LogInfoId {
  generic = 1000,
}

enum LogWarnId {
  generic = 2000,
  fragmentFlatten = 2200,
}

enum LogErrorId {
  generic = 3000,
  reInit,
  fragmentCall = 3200,
}

// TODO: define args: message, id?, err (optional on warn, required on error)
export interface Logger {
  info?: (message: string, id: LogInfoId) => void;
  warn?: (message: string, id: LogWarnId, err?: unknown) => void;
  error?: (message: string, id: LogErrorId, err: unknown) => void;
}

let logger: Logger | undefined = undefined;

// TODO: Logger for dev mode should have opt-in to send metrics to central server for analysis

export function setLogger(logger: Logger) {
  logger = logger;
}

export const Fragment = () => {
  const err = new Error('Fragment should never be called');
  if (logger) {
    logger.error?.(err.message, LogErrorId.fragmentCall, err);
  }
  throw err;
};

const intrinsicContextOverrides: Record<
  string,
  JSX.IntrinsicCreateChildContext | undefined
> = {};

export function setIntrinsicContextOverrides(
  overrides: Record<string, JSX.IntrinsicCreateChildContext | undefined>
) {
  Object.assign(intrinsicContextOverrides, overrides);
}

const nodeRegistry = new WeakSet();

export function makeNode(node: JSX.Node) {
  nodeRegistry.add(node);
  return node;
}

export function jsx(
  tag: JSX.ElementType,
  props: Record<string, unknown>,
  key?: {}
): JSX.Node {
  if (tag === Fragment) {
    const { children } = props;

    if (logger && isNode(children) && children.nodeType === NodeType.Fragment) {
      logger.warn?.(
        'A Fragment child will not flatten when inside another Fragment',
        LogWarnId.fragmentFlatten
      );
    }

    return makeNode({
      nodeType: NodeType.Fragment,
      isInitialized: false,
      children,
      key,
    });
  } else if (typeof tag === 'function') {
    return makeNode({
      nodeType: NodeType.Component,
      isInitialized: false,
      props,
      tag,
      key,
    });
  } else {
    const { children } = props;

    if (logger && isNode(children) && children.nodeType === NodeType.Fragment) {
      logger.warn?.(
        'A Fragment child will not flatten when inside jsx literals',
        LogWarnId.fragmentFlatten
      );
    }

    return makeNode({
      nodeType: NodeType.Intrinsic,
      isInitialized: false,
      tag,
      props,
      children,
      key,
    });
  }
}

interface WritableNode extends JSX.BaseNode {
  isInitialized: boolean;
  children?: unknown;
}

export function isNode(maybeNode: unknown): maybeNode is JSX.Node {
  return !!maybeNode && nodeRegistry.has(maybeNode);
}

export function initNode(node: JSX.Node, context: JSX.ComponentContext = {}) {
  if (node.isInitialized) {
    const err = new Error('Cannot initialize node that is initialized');
    if (logger) {
      logger.error?.(err.message, LogErrorId.reInit, err);
    }
    throw err;
  }

  let childContext = context;
  switch (node.nodeType) {
    case NodeType.Component: {
      const { tag, props } = node;
      const child = tag(props, context);
      if (isNode(child) && child.nodeType === NodeType.Fragment) {
        (node as WritableNode).children = child.children;
      } else {
        (node as WritableNode).children = child;
      }
      break;
    }
    case NodeType.Context: {
      childContext = { ...context, ...node.contextUpdate };
      break;
    }
    case NodeType.Intrinsic: {
      // TODO: throw here and instead provide a separate extension jsx lib with init that handles dom context overrides
      // the base lib does not allow initializing intrinsics and instead suggests only using them with template functions
      // perhaps base lib should disallow even creating intrinsic nodes to avoid confusion
      const deriveContextUpdate = intrinsicContextOverrides[node.tag];
      if (deriveContextUpdate) {
        childContext = { ...context, ...deriveContextUpdate(node, context) };
      }
      break;
    }
  }

  const { children } = node;
  if (children) {
    if (Array.isArray(children)) {
      for (const child of children) {
        if (isNode(child)) {
          initNode(child, childContext);
        }
      }
    } else if (isNode(children)) {
      initNode(children, childContext);
    }
  }

  (node as WritableNode).isInitialized = true;

  // TODO: Add support for post init hook
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
