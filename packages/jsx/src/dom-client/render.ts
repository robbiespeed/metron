import {
  NODE_TYPE_COMPONENT,
  NODE_TYPE_CONTEXT_PROVIDER,
  NODE_TYPE_INTRINSIC,
  isJSXNode,
  type JSXNode,
  type JSXIntrinsicNode,
  NODE_TYPE_ADVANCED,
  type JSXRenderFn,
} from '../node.js';
import { type Context, createRootContext, disposeContext } from '../context.js';
import { isIterable } from '../utils.js';
import { isAtom, subscribe } from '@metron/core/atom.js';
import {
  initAttributeFromState,
  initEventFromState,
  initPropFromState,
  initSetupFromState,
} from './element.js';
import type { Disposer } from '@metron/core/shared.js';

interface DomRenderContextProps {
  readonly root: ParentNode;
  readonly children: unknown;
}

type JSXRender = {
  [key in JSXNode['nodeType']]: JSXRenderFn<
    Extract<JSXNode, { nodeType: key }>,
    ChildNode,
    ParentNode | undefined
  >;
};

export const EVENT_HANDLER_PREFIX = 'on:';
export const EVENT_HANDLER_PREFIX_LENGTH = EVENT_HANDLER_PREFIX.length;

export function render(
  { root, children }: DomRenderContextProps,
  context?: Context
): Disposer {
  if (children == null) {
    throw new TypeError('Expected children');
  }

  if (context !== undefined) {
    throw new Error('TODO');
  }

  // const [renderContext, dispose] = createRootContext();
  const renderContext = createRootContext();

  root.textContent = '';

  renderInto(
    children,
    renderContext,
    (child) => {
      root.appendChild(child);
    },
    root
  );

  const dispose: Disposer = () => {
    disposeContext(renderContext);
  };

  (root as any)['__METRON_RENDER_DISPOSE'] = dispose;

  return dispose;
}

/**
 * @private
 */
export const jsxRender: JSXRender = {
  [NODE_TYPE_COMPONENT](component, context, append, parent) {
    const { tag, props } = component;

    const children = tag(props, context);

    if (children != null) {
      renderInto(children, context, append, parent);
    }
  },
  [NODE_TYPE_INTRINSIC]: renderIntrinsic,
  [NODE_TYPE_CONTEXT_PROVIDER](
    { props: { children, assignments } },
    context,
    append,
    parent
  ) {
    if (children != null) {
      throw new Error('TODO');
      // const childContext = { ...context };
      // renderInto(children, childContext, append, parent);
    }
  },
  [NODE_TYPE_ADVANCED](node, context, append, parent) {
    node.tag(node.props, context, append, parent);
  },
};

export function renderIntrinsic(
  intrinsic: JSXIntrinsicNode,
  context: Context,
  append: (child: ChildNode) => void
): undefined {
  const { children, ...props } = intrinsic.props as Record<string, unknown>;

  const element = document.createElement(intrinsic.tag);
  const { register } = context;

  for (const key of Object.keys(props)) {
    let [keySpecifier, keyName] = key.split(':', 2) as [string, string];
    if (keySpecifier === key) {
      keyName = keySpecifier;
      keySpecifier = 'attr';
    }

    switch (keySpecifier) {
      case 'setup':
        initSetupFromState(key, element, props, register);
        continue;
      case 'prop': {
        initPropFromState(keyName, key, element, props, register);
        continue;
      }
      case 'attr': {
        if (key === 'class') {
          initPropFromState('className', key, element, props, register);
          continue;
        }
        initAttributeFromState(keyName, key, element, props, register);
        continue;
      }
      case 'toggle': {
        initAttributeFromState(keyName, key, element, props, register);
        continue;
      }
      case 'on': {
        initEventFromState(keyName, key, element, props);
        continue;
      }
      default:
        throw new TypeError(`Unsupported specifier "${keySpecifier}"`);
    }
  }

  if (children != null) {
    renderInto(
      children,
      context,
      (child) => {
        element.appendChild(child);
      },
      element
    );
  }

  append(element);
}

/**
 * @private
 */
export function renderInto(
  value: {},
  context: Context,
  append: (child: ChildNode) => void,
  parent: ParentNode | undefined
): void {
  if (typeof value === 'object') {
    if (isJSXNode(value)) {
      return jsxRender[value.nodeType](value as any, context, append, parent);
    } else if (isIterable(value)) {
      for (const child of value) {
        if (child != null) {
          renderInto(child, context, append, undefined);
        }
      }
      return;
    } else if (isAtom(value)) {
      const firstValue = value.unwrap();

      const text = document.createTextNode(
        // createTextNode casts param to string
        firstValue === undefined ? '' : (firstValue as any)
      );
      append(text);

      context.register(
        subscribe(value, () => {
          const newValue = value.unwrap();
          // Data casts to string
          // TODO: .nodeValue faster?
          text.data = newValue === undefined ? '' : (newValue as any);
        })
      );
      return;
    } else if (value instanceof Element) {
      append(value);
      return;
    }
  }
  // createTextNode casts to string
  append(document.createTextNode(value as any));
}
