import type { Disposer } from '@metron/core/shared.js';
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
import {
  type JSXContext,
  createRootContext,
  createChildContext,
} from '../context.js';
import { isIterable, assertOverride, dispose } from '../utils.js';
import { EVENT_DATA_KEY_PREFIX, EVENT_KEY_PREFIX } from './events.js';
import type { DelegatedEventTarget, DelegatedEventParams } from './events.js';
import { isAtom, runAndSubscribe, subscribe } from '@metron/core/atom.js';

interface DomRenderContextProps {
  readonly root: ParentNode;
  readonly children: unknown;
}

type NodeAppend = (node: ChildNode) => void;

type JSXRender = {
  [key in JSXNode['nodeType']]: JSXRenderFn<
    Extract<JSXNode, { nodeType: key }>,
    ParentNode | null,
    ChildNode
  >;
};

export const EVENT_HANDLER_PREFIX = 'on:';
export const EVENT_HANDLER_PREFIX_LENGTH = EVENT_HANDLER_PREFIX.length;

export function render(
  { root, children }: DomRenderContextProps,
  context = createRootContext()
): Disposer {
  if (children == null) {
    root.replaceChildren();
    return () => {};
  }

  const append = root.appendChild.bind(root);
  const disposers: Disposer[] = [];

  const addDisposer = disposers.push.bind(disposers);

  renderInto(children, context, addDisposer, root, append);

  return () => {
    dispose(disposers);
    disposers.length = 0;
  };
}

/**
 * @private
 */
export const jsxRender: JSXRender = {
  [NODE_TYPE_COMPONENT](component, context, regDispose, parent, append) {
    const { tag, props } = component;

    const children = tag(props, context);

    if (children != null) {
      renderInto(children, context, regDispose, parent, append);
    }
  },
  [NODE_TYPE_INTRINSIC]: renderIntrinsic,
  [NODE_TYPE_CONTEXT_PROVIDER](
    { props: { children, assignments } },
    context,
    regDispose,
    parent,
    append
  ) {
    if (children != null) {
      const childContext = createChildContext(context, assignments);
      renderInto(children, childContext, regDispose, parent, append);
    }
  },
  [NODE_TYPE_ADVANCED](node, context, regDispose, parent, append) {
    node.tag(node.props, context, regDispose, parent, append);
  },
};

export function renderIntrinsic(
  intrinsic: JSXIntrinsicNode,
  context: JSXContext,
  regDispose: (dispose: Disposer) => void,
  parent: ParentNode | null,
  append: NodeAppend
): undefined {
  const { children, ...props } = intrinsic.props as Record<string, unknown>;

  const element = document.createElement(intrinsic.tag);

  for (const [fullKey, value] of Object.entries(props)) {
    if (value == undefined) {
      continue;
    }
    let [keySpecifier, key] = fullKey.split(':', 2) as [string, string];
    if (keySpecifier === fullKey) {
      key = keySpecifier;
      keySpecifier = 'attr';
    }
    switch (keySpecifier) {
      case 'setup':
        (value as Function)(element);
        continue;
      case 'prop': {
        if (isAtom(value)) {
          regDispose(
            runAndSubscribe(value, () => {
              // Expect the user knows what they are doing
              (element as any)[key] = value.unwrap();
            })
          );
        } else {
          // Expect the user knows what they are doing
          (element as any)[key] = value;
        }
        continue;
      }
      case 'attr': {
        if (isAtom(value)) {
          const firstValue = value.unwrap();

          if (firstValue === true) {
            element.toggleAttribute(key, true);
          } else if (firstValue !== undefined && firstValue !== false) {
            // setAttribute casts to string
            element.setAttribute(key, firstValue as any);
          }

          regDispose(
            subscribe(value, () => {
              const innerValue = value.unwrap();
              switch (typeof innerValue) {
                case 'boolean':
                  element.toggleAttribute(key, innerValue);
                  break;
                case 'undefined':
                  element.removeAttribute(key);
                  break;
                default:
                  // setAttribute casts to string
                  element.setAttribute(key, innerValue as any);
                  break;
              }
            })
          );
        } else if (value === true) {
          element.toggleAttribute(key, true);
        } else if (value !== false && value !== undefined) {
          element.setAttribute(key, value as string);
        }
        continue;
      }
      case 'on': {
        if (value === undefined) {
          continue;
        }

        assertOverride<EventListener>(value);
        element.addEventListener(key, value, { passive: true });

        continue;
      }
      case 'delegate': {
        if (value === undefined) {
          continue;
        }

        // TODO: Dev mode only, check if key is in delegatedEventTypes and warn if not

        assertOverride<DelegatedEventParams<unknown, EventTarget>>(value);
        assertOverride<DelegatedEventTarget>(element);

        element[`${EVENT_KEY_PREFIX}:${key}`] = value.handler;
        element[`${EVENT_DATA_KEY_PREFIX}:${key}`] = value.data;

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
      regDispose,
      element,
      element.appendChild.bind(element)
    );
  }

  append(element);
}

/**
 * @private
 */
export function renderInto(
  value: {},
  context: JSXContext,
  regDispose: (dispose: Disposer) => void,
  parent: ParentNode | null,
  append: NodeAppend
): void {
  if (typeof value === 'object') {
    if (isJSXNode(value)) {
      return jsxRender[value.nodeType](
        value as any,
        context,
        regDispose,
        parent,
        append
      );
    } else if (isIterable(value)) {
      for (const child of value) {
        if (child != null) {
          renderInto(child, context, regDispose, null, append);
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

      regDispose(
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
