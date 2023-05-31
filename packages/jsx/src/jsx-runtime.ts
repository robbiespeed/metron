declare namespace JSX {
  interface IntrinsicElements {
    [tagName: string]: Record<string, unknown>;
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
  type Element = FragmentNode | IntrinsicNode | ComponentNode;
}

export type { JSX };

// TODO: convert from enums
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
// Logger for dev mode should have opt-in to send metrics to central server for analysis
// move this to shared lib? Along with handling of id message dictionaries, and a logger implementation.
export interface Logger {
  info?: (message: string, id: LogInfoId) => void;
  warn?: (message: string, id: LogWarnId, err?: unknown) => void;
  error?: (message: string, id: LogErrorId, err: unknown) => void;
}

let logger: Logger | undefined = undefined;

export function setLogger(logger: Logger) {
  logger = logger;
}

let isDevMode = false;

export function enableDevMode() {
  isDevMode = true;
}

export const Fragment = () => {
  const err = new Error('Fragment should never be called');
  if (logger) {
    logger.error?.(err.message, LogErrorId.fragmentCall, err);
  }
  throw err;
};

// TODO move to jsx-dom/runtime/intrinsic
type IntrinsicCreateChildContext = (
  node: IntrinsicNode,
  parentContext: ComponentContext
) => ComponentContext;

const intrinsicContextOverrides: Record<
  string,
  IntrinsicCreateChildContext | undefined
> = {};

export function setIntrinsicContextOverrides(
  overrides: Record<string, IntrinsicCreateChildContext | undefined>
) {
  Object.assign(intrinsicContextOverrides, overrides);
}

const NODE_TYPE_COMPONENT = 'Component';
const NODE_TYPE_CONTEXT = 'Context';
const NODE_TYPE_FRAGMENT = 'Fragment';
const NODE_TYPE_INTRINSIC = 'Intrinsic';

const nodeBrandKey = Symbol('jsx-node');

// TODO: turn these into classes and convert nodeBrandKey to a #branded = true
// Then use Node.isNode() instead of isNode
export interface BaseNode {
  readonly [nodeBrandKey]: true;
  readonly isInitialized: boolean;
  readonly key?: {};
  readonly children?: unknown;
}

export interface ComponentNode extends BaseNode {
  readonly nodeType: typeof NODE_TYPE_COMPONENT;
  readonly tag: ComponentFunction<object>;
  readonly props: object;
}

export interface ContextNode extends BaseNode {
  readonly nodeType: typeof NODE_TYPE_CONTEXT;
  readonly contextUpdate: ComponentContext;
}

export interface FragmentNode extends BaseNode {
  readonly nodeType: typeof NODE_TYPE_FRAGMENT;
}

export interface IntrinsicNode extends BaseNode {
  readonly nodeType: typeof NODE_TYPE_INTRINSIC;
  readonly props: object;
  readonly tag: string;
}

export type Node = ContextNode | FragmentNode | IntrinsicNode | ComponentNode;

export interface ComponentContext {
  readonly [key: string]: unknown;
}

export interface ComponentFunction<Props> {
  (props: Props, context: ComponentContext): Node | Node[] | undefined;
}

export function isNode(maybeNode: unknown): maybeNode is Node {
  return !!maybeNode && (maybeNode as Node)[nodeBrandKey] === true;
}

export function jsx(
  tag: ComponentFunction<any> | string,
  props: Record<string, unknown>,
  key?: {}
): FragmentNode | IntrinsicNode | ComponentNode {
  if (tag === Fragment) {
    const { children } = props;

    // TODO: maybe return children if it is a single node... or just always return children and return type / JSX.element is unknown?

    if (
      isDevMode &&
      logger &&
      isNode(children) &&
      children.nodeType === NODE_TYPE_FRAGMENT
    ) {
      logger.warn?.(
        'A Fragment child will not flatten when inside another Fragment',
        LogWarnId.fragmentFlatten
      );
    }

    return {
      [nodeBrandKey]: true,
      nodeType: NODE_TYPE_FRAGMENT,
      isInitialized: false,
      children,
      key,
    };
  } else if (typeof tag === 'function') {
    return {
      [nodeBrandKey]: true,
      nodeType: NODE_TYPE_COMPONENT,
      isInitialized: false,
      props,
      tag,
      key,
    };
  } else {
    const { children } = props;

    if (
      isDevMode &&
      logger &&
      isNode(children) &&
      children.nodeType === NODE_TYPE_FRAGMENT
    ) {
      logger.warn?.(
        'A Fragment child will not flatten when inside jsx literals',
        LogWarnId.fragmentFlatten
      );
    }

    return {
      [nodeBrandKey]: true,
      nodeType: NODE_TYPE_INTRINSIC,
      isInitialized: false,
      tag,
      props,
      children,
      key,
    };
  }
}

interface WritableNode extends BaseNode {
  isInitialized: boolean;
  children?: unknown;
}

export function initNode(node: Node, context: ComponentContext = {}) {
  if (node.isInitialized) {
    const err = new Error('Cannot initialize node that is initialized');
    if (logger) {
      logger.error?.(err.message, LogErrorId.reInit, err);
    }
    throw err;
  }

  let childContext = context;
  switch (node.nodeType) {
    case NODE_TYPE_COMPONENT: {
      const { tag, props } = node;
      const child = tag(props, context);
      if (isNode(child) && child.nodeType === NODE_TYPE_FRAGMENT) {
        (node as WritableNode).children = child.children;
      } else {
        (node as WritableNode).children = child;
      }
      break;
    }
    case NODE_TYPE_CONTEXT: {
      childContext = { ...context, ...node.contextUpdate };
      break;
    }
    case NODE_TYPE_INTRINSIC: {
      // TODO: throw here and instead provide a separate extension jsx lib with init that handles dom context overrides
      // the base lib does not allow initializing intrinsics and instead suggests only using them with template functions
      // perhaps base lib should disallow even creating intrinsic nodes to avoid confusion
      const deriveContextPatch = intrinsicContextOverrides[node.tag];
      if (deriveContextPatch) {
        childContext = { ...context, ...deriveContextPatch(node, context) };
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
