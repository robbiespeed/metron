import { isDevMode, logger } from './env.js';
import {
  createContext,
  type ComponentContext,
  type ComponentFunction,
  NODE_TYPE_COMPONENT,
  NODE_TYPE_INTRINSIC,
  NODE_TYPE_FRAGMENT,
  NODE_TYPE_CONTEXT_PROVIDER,
  NODE_TYPE_RENDER_ENGINE_CONTEXT,
} from './node.js';

const nodeBrandKey = Symbol('metron-jsx-node');

type Writable<T> = {
  -readonly [K in keyof T]: T[K];
};

type NodeUnion = ComponentNode | IntrinsicNode;

abstract class Node {
  readonly [nodeBrandKey] = true;
  abstract readonly nodeType: string;
  readonly isInitialized: boolean = false;
  readonly key?: {};
  readonly children?: unknown;
  constructor(key?: {}) {
    this.key = key;
  }
  init(
    this: Writable<NodeUnion>,
    context: ComponentContext = createContext()
  ): void {
    if (this.isInitialized) {
      const err = new Error('Cannot reinitialize a node');
      if (logger) {
        logger.error?.(err.message, err);
      }
      throw err;
    }
    this.isInitialized = true;
    let childContext = context;
    const node = this;
    switch (node.nodeType) {
      case NODE_TYPE_COMPONENT: {
        const { tag, props } = node;
        const child = tag(props, context);
        this.children = child;
        break;
      }
      case NODE_TYPE_CONTEXT_PROVIDER: {
        childContext = createContext({
          ...context[valueOfKey](),
          ...this.contextStoreUpdate,
        });
        this.context = childContext;
        break;
      }
      case NODE_TYPE_RENDER_ENGINE_CONTEXT: {
        this.render = renderStore[this.renderContextKey];
        break;
      }
      case NODE_TYPE_INTRINSIC: {
        const { children } = this;
        if (
          isDevMode &&
          logger &&
          Node.isNode(children) &&
          children.nodeType === NODE_TYPE_FRAGMENT
        ) {
          logger.warn?.(
            'Fragment cannot be a direct child of an intrinsic node'
          );
        }
        break;
      }
    }

    let { children } = this;
    if (children) {
      if (isAtom(children)) {
        children = children[valueOfKey]();
      }

      if (isIterable(children)) {
        for (const child of children) {
          initNodeElement(child, childContext, render);
        }
      } else {
        initNodeElement(children, childContext, render);
      }
    }

    (element as WritableNode).isInitialized = true;
    // TODO: add support for post init/pre render hooks
    render?.(element);
    // TODO: add support for post render hooks
  }
  static isNode(value: unknown): value is Node {
    return (value as any)?.[nodeBrandKey] !== undefined;
  }
}

class ComponentNode extends Node {
  readonly nodeType = NODE_TYPE_COMPONENT;
  readonly tag: ComponentFunction<object>;
  readonly props: object;
  constructor(tag: ComponentFunction<object>, props: object, key?: {}) {
    super(key);
    this.tag = tag;
    this.props = props;
  }
}

class IntrinsicNode extends Node {
  readonly nodeType = NODE_TYPE_INTRINSIC;
  readonly tag: string;
  readonly props: object;
  constructor(tag: string, props: object, key?: {}) {
    super(key);
    this.tag = tag;
    this.props = props;
  }
}
