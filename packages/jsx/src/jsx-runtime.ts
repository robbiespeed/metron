const nodeBrandKey = Symbol('nodeBrandKey');

enum NodeType {
  Intrinsic,
  Fragment,
  Component,
}

declare namespace JSX {
  interface IntrinsicElements {
    [tagName: string]: {
      [propName: string]: unknown;
    };
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
    readonly createContext?: (
      parentContext: ComponentContext
    ) => ComponentContext;
  }

  interface FragmentNode extends BaseNode {
    readonly nodeType: NodeType.Fragment;
    readonly createContext?: undefined;
  }

  interface IntrinsicNode extends BaseNode {
    readonly nodeType: NodeType.Intrinsic;
    readonly tag: string;
    readonly props: object;
  }

  interface ComponentNode extends BaseNode {
    readonly nodeType: NodeType.Component;
    readonly tag: ComponentFunction<object>;
    readonly props: object;
  }

  type Node = FragmentNode | IntrinsicNode | ComponentNode;

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

const nodeRegistry = new WeakSet();

export function createNode(node: JSX.Node) {
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

    return createNode({
      nodeType: NodeType.Fragment,
      isInitialized: false,
      children,
      key,
    });
  } else if (typeof tag === 'function') {
    return createNode({
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

    return createNode({
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

export function initNode(
  node: JSX.Node,
  parentContext: JSX.ComponentContext = {}
) {
  if (node.isInitialized) {
    const err = new Error('Cannot initialize node that is initialized');
    if (logger) {
      logger.error?.(
        'Cannot initialize node that is initialized',
        LogErrorId.reInit,
        err
      );
    }
    throw err;
  }

  const { createContext } = node;

  const context = createContext ? createContext(parentContext) : parentContext;

  // When a component node and children have not been set the component must be initialized
  if (node.nodeType === NodeType.Component) {
    const { tag, props } = node;
    const child = tag(props, context);
    if (isNode(child) && child.nodeType === NodeType.Fragment) {
      (node as WritableNode).children = child.children;
    } else {
      (node as WritableNode).children = child;
    }
  }

  // TODO: Add support for pre update hook

  const { children } = node;
  if (children) {
    if (Array.isArray(children)) {
      for (const child of children) {
        if (isNode(child)) {
          initNode(child, context);
        }
      }
    } else if (isNode(children)) {
      initNode(children, context);
    }
  }

  (node as WritableNode).isInitialized = true;

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
