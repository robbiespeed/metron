import {
  isJSXNode,
  type JSXNode,
  type JSXProps,
  type Component,
  NODE_TYPE_INTRINSIC,
} from '../node.js';
import type { JSXContext } from '../context.js';
import { jsxRender, renderInto } from './render.js';
import { assertOverride, isIterable } from '../utils.js';
import {
  type DelegatedEventTarget,
  EVENT_KEY_PREFIX,
  EVENT_DATA_KEY_PREFIX,
  type DelegatedEventParams,
} from './events.js';
import { isAtom, runAndSubscribe, subscribe } from '@metron/core/atom.js';
import type { Disposer } from '@metron/core/shared.js';

// TODO: allow components to be part of template
// interface ComponentInitDescriptor<
//   TProps extends JSXProps = Record<string, unknown>
// > {}

interface IntrinsicInitDescriptor<
  TProps extends JSXProps = Record<string, unknown>
> {
  props: undefined | { key: string; initKey: keyof TProps }[];
  attributes: undefined | { key: string; initKey: keyof TProps }[];
  events: undefined | { key: string; initKey: keyof TProps }[];
  delegatedEvents: undefined | { key: string; initKey: keyof TProps }[];
  setups: undefined | (keyof TProps)[];
  children:
    | undefined
    | {
        [index: number]: IntrinsicInitDescriptor | keyof TProps;
        lastIndex: number;
      };
}

// export type Slot<T = unknown> = T & {
//   [IS_SLOT]: true;
//   [SLOT_KEY]: string;
// };

type PropAccessor<TProps extends JSXProps> = {
  [K in keyof TProps]: Slot & TProps[K];
};

// const fakeToValue = () => {
//   throw new Error('Slot cannot be cast to value');
// };

const IS_SLOT = Symbol();

class Slot {
  [IS_SLOT] = true;
  #key: string;
  constructor(key: string) {
    this.#key = key;
  }
  static isSlot(value: {}): value is Slot {
    return (value as any)[IS_SLOT] === true;
  }
  static getSlotKey(slot: Slot): string {
    return slot.#key;
  }
}

const { isSlot, getSlotKey } = Slot;

const noOpTrap = () => false;
const empty = Object.create(null);
const propProxy: PropAccessor<any> = new Proxy(empty, {
  get(_, key: string) {
    return new Slot(key);
  },
  set: noOpTrap,
  has: noOpTrap,
  setPrototypeOf: noOpTrap,
  defineProperty: noOpTrap,
  deleteProperty: noOpTrap,
});

interface DynamicTemplateCreator<TProps extends JSXProps> {
  (props: PropAccessor<TProps>): JSXNode;
}

export type TemplateComponent<TProps extends JSXProps = JSXProps> = Component<
  TProps,
  Element
>;

const cloneNode = Node.prototype.cloneNode;

function bindableTemplateComponent<TProps extends JSXProps = JSXProps>(
  this: IntrinsicInitDescriptor,
  createElement: () => Element,
  props: TProps,
  context: JSXContext,
  register: (dispose: Disposer) => void
) {
  const element = createElement();
  initElement(element, props, context, register, this);
  return element;
}

export function template<TProps extends JSXProps>(
  createTemplate: DynamicTemplateCreator<TProps>
): TemplateComponent<TProps> {
  const templateNode = createTemplate(propProxy);
  const [templateElement, descriptor] = renderTemplateNode(templateNode);
  const createElement = cloneNode.bind(templateElement, true) as () => Element;

  return descriptor === undefined
    ? createElement
    : bindableTemplateComponent.bind(descriptor, createElement);
}

function bindableStatefulTemplateComponent(
  this: IntrinsicInitDescriptor,
  createElement: () => Element,
  createState: (
    props: JSXProps,
    context: JSXContext,
    register: (dispose: Disposer) => void
  ) => JSXProps,
  props: JSXProps,
  context: JSXContext,
  register: (dispose: Disposer) => void
) {
  const element = createElement();
  initElement(
    element,
    createState(props, context, register),
    context,
    register,
    this
  );
  return element;
}

export function statefulTemplate<
  TProps extends JSXProps,
  TState extends JSXProps
>(
  createState: (
    props: TProps,
    context: JSXContext,
    register: (dispose: Disposer) => undefined
  ) => TState,
  createTemplate: DynamicTemplateCreator<TState>
): TemplateComponent<TProps> {
  const templateNode = createTemplate(propProxy);
  const [templateElement, descriptor] = renderTemplateNode(templateNode);
  const createElement = cloneNode.bind(templateElement, true) as () => Element;

  return descriptor === undefined
    ? createElement
    : bindableStatefulTemplateComponent.bind(
        descriptor,
        createElement,
        createState as any
      );
}

function renderTemplateNode(
  intrinsic: JSXNode
): [Element, undefined | IntrinsicInitDescriptor] {
  // TODO: should allow handling of non intrinsic node and have their creation be delayed until init.
  // intrinsics nested inside other nodes like components could create a separate template
  if (intrinsic.nodeType !== NODE_TYPE_INTRINSIC) {
    throw new TypeError('Template may only contain intrinsic nodes');
  }

  const { children, ...templateProps } = intrinsic.props as Record<
    string,
    unknown
  >;

  const element = document.createElement(intrinsic.tag);
  let attributeDescriptors: IntrinsicInitDescriptor['attributes'];
  let propDescriptors: IntrinsicInitDescriptor['props'];
  let eventDescriptors: IntrinsicInitDescriptor['events'];
  let delegatedEventDescriptors: IntrinsicInitDescriptor['delegatedEvents'];
  let setupDescriptors: IntrinsicInitDescriptor['setups'];

  for (const [key, value] of Object.entries(templateProps)) {
    if (value == null) {
      continue;
    }

    let [keySpecifier, keyName] = key.split(':', 2) as [string, string];
    if (keySpecifier === key) {
      keyName = keySpecifier;
      keySpecifier = 'attr';
    }
    switch (keySpecifier) {
      case 'setup':
        if (isSlot(value)) {
          (setupDescriptors ??= []).push(getSlotKey(value));
        } else {
          throw new TypeError(
            'Templates may only use slots to register setup functions'
          );
        }
        continue;
      case 'prop':
        if (isSlot(value)) {
          (propDescriptors ??= []).push({
            key: keyName,
            initKey: getSlotKey(value),
          });
        } else {
          throw new TypeError('Templates may only use slots to register props');
        }
        continue;
      case 'attr':
        if (isSlot(value)) {
          if (keyName === 'class') {
            (propDescriptors ??= []).push({
              key: 'className',
              initKey: getSlotKey(value),
            });
          } else {
            (attributeDescriptors ??= []).push({
              key: keyName,
              initKey: getSlotKey(value),
            });
          }
        } else if (value === true) {
          element.toggleAttribute(keyName, true);
        } else {
          // setAttribute casts to string
          element.setAttribute(keyName, value as any);
        }
        continue;
      case 'on':
        if (isSlot(value)) {
          (eventDescriptors ??= []).push({
            key: keyName,
            initKey: getSlotKey(value),
          });
        } else {
          throw new TypeError(
            'Templates may only use slots to register event handlers'
          );
        }
        continue;
      case 'delegate':
        if (isSlot(value)) {
          (delegatedEventDescriptors ??= []).push({
            key: keyName,
            initKey: getSlotKey(value),
          });
        } else {
          throw new TypeError(
            'Templates may only use slots to register data event handlers'
          );
        }
        continue;
      default:
        throw new TypeError(`Unsupported specifier "${keySpecifier}"`);
    }
  }

  let childDescriptors: IntrinsicInitDescriptor['children'];

  if (Array.isArray(children)) {
    const childNodes: ChildNode[] = [];
    const childrenCount = children.length;

    for (let i = 0; i < childrenCount; i++) {
      const child: unknown = children[i];
      if (child == null) {
        continue;
      }
      if (isSlot(child)) {
        if (childDescriptors === undefined) {
          childDescriptors = { lastIndex: i, [i]: getSlotKey(child) };
        } else {
          childDescriptors.lastIndex = i;
          childDescriptors[i] = getSlotKey(child);
        }
        childNodes.push(document.createTextNode(''));
      } else if (isJSXNode(child)) {
        const [childElement, childDescriptor] = renderTemplateNode(child);
        if (childDescriptor !== undefined) {
          if (childDescriptors === undefined) {
            childDescriptors = { lastIndex: i, [i]: childDescriptor };
          } else {
            childDescriptors.lastIndex = i;
            childDescriptors[i] = childDescriptor;
          }
        }
        childNodes.push(childElement);
      } else if (typeof child === 'string') {
        childNodes.push(document.createTextNode(child as string));
      } else {
        childNodes.push(document.createTextNode(''));
      }
    }
    element.append(...childNodes);
  } else if (children != undefined) {
    if (isSlot(children)) {
      childDescriptors = { lastIndex: 0, 0: getSlotKey(children) };
      element.appendChild(document.createTextNode(''));
    } else if (isJSXNode(children)) {
      const [childElement, childDescriptor] = renderTemplateNode(children);

      if (childDescriptor !== undefined) {
        childDescriptors = { lastIndex: 0, 0: childDescriptor };
      }
      element.appendChild(childElement);
    } else if (typeof children === 'string') {
      element.textContent = children;
    }
  }

  const descriptor: IntrinsicInitDescriptor | undefined =
    attributeDescriptors ??
    childDescriptors ??
    delegatedEventDescriptors ??
    eventDescriptors ??
    setupDescriptors ??
    propDescriptors
      ? {
          attributes: attributeDescriptors,
          children: childDescriptors,
          delegatedEvents: delegatedEventDescriptors,
          events: eventDescriptors,
          setups: setupDescriptors,
          props: propDescriptors,
        }
      : undefined;

  return [element, descriptor];
}

function initElement(
  element: Element,
  initProps: Record<string, unknown>,
  context: JSXContext,
  regDispose: (dispose: Disposer) => void,
  {
    children,
    attributes,
    delegatedEvents,
    events,
    props,
    setups,
  }: IntrinsicInitDescriptor
) {
  if (setups !== undefined) {
    for (const initKey of setups) {
      const setupHandler = initProps[initKey];
      // If not callable then it's okay to throw
      (setupHandler as Function)(element);
    }
  }

  if (attributes !== undefined) {
    for (const { initKey, key } of attributes) {
      const initValue = initProps[initKey];

      if (initValue == null || initValue === false) {
        continue;
      } else if (initValue === true) {
        element.toggleAttribute(key, true);
      } else if (isAtom(initValue)) {
        const firstValue = initValue.unwrap();

        if (firstValue === true) {
          element.toggleAttribute(key, true);
        } else if (firstValue !== undefined && firstValue !== false) {
          // setAttribute casts to string
          element.setAttribute(key, firstValue as any);
        }

        regDispose(
          subscribe(initValue, () => {
            const value = initValue.unwrap();
            switch (typeof value) {
              case 'boolean':
                element.toggleAttribute(key, value);
                break;
              case 'undefined':
                element.removeAttribute(key);
                break;
              default:
                // setAttribute casts to string
                element.setAttribute(key, value as any);
                break;
            }
          })
        );
      } else {
        // setAttribute casts to string
        element.setAttribute(key, initValue as any);
      }
    }
  }
  if (delegatedEvents !== undefined) {
    // TODO: Dev mode only
    // const delegatedEventTypes = use(eventDelegatorContextKey);

    for (const { initKey, key } of delegatedEvents) {
      const value = initProps[initKey];

      if (value === undefined) {
        continue;
      }

      // TODO: Dev mode only, check if key is in delegatedEventTypes and warn if not

      assertOverride<DelegatedEventParams<unknown, EventTarget>>(value);
      assertOverride<DelegatedEventTarget>(element);

      element[`${EVENT_KEY_PREFIX}:${key}`] = value.handler;
      element[`${EVENT_DATA_KEY_PREFIX}:${key}`] = value.data;
    }
  }
  if (events !== undefined) {
    for (const { initKey, key } of events) {
      const value = initProps[initKey];

      if (value === undefined) {
        continue;
      }

      assertOverride<EventListener>(value);
      element.addEventListener(key, value, { passive: true });
    }
  }
  if (props !== undefined) {
    for (const { key, initKey } of props) {
      const initValue = initProps[initKey];

      if (initValue == null) {
        continue;
      }
      if (isAtom(initValue)) {
        regDispose(
          runAndSubscribe(initValue, () => {
            // Expect the user knows what they are doing
            (element as any)[key] = initValue.unwrap();
          })
        );
      } else {
        // Expect the user knows what they are doing
        (element as any)[key] = initValue;
      }
    }
  }
  if (children !== undefined) {
    const { lastIndex } = children;

    let node = element.firstChild;
    const parent = element.lastChild === node ? element : undefined;
    let i = 0;
    while (node !== null) {
      const childDescriptor = children[i];
      switch (typeof childDescriptor) {
        case 'string':
          initSlottedChild(
            parent,
            initProps[childDescriptor],
            context,
            regDispose,
            node as Text
          );
          break;
        case 'object':
          initElement(
            node as Element,
            initProps,
            context,
            regDispose,
            childDescriptor
          );
          break;
      }

      node = i < lastIndex ? node.nextSibling : null;
      i++;
    }
  }
}

function initSlottedChild(
  parent: ParentNode | undefined,
  initValue: unknown,
  context: JSXContext,
  regDispose: (dispose: Disposer) => void,
  placeHolder: Text
) {
  if (initValue == null) {
    return;
  }
  switch (typeof initValue) {
    case 'object': {
      // TODO: pass context
      // if (isAtomList(initValue)) {
      //   const newNodes: ChildNode[] = [];
      //   renderAtomArrayInto(
      //     parent,
      //     newNodes.push.bind(newNodes),
      //     initValue,
      //     context
      //   );
      //   placeHolder.replaceWith(...newNodes);
      // } else
      if (isAtom(initValue)) {
        regDispose(
          runAndSubscribe(initValue, () => {
            const value = initValue.unwrap();
            if (value === undefined) {
              placeHolder!.data = '';
            } else {
              // Data casts to string
              placeHolder!.data = value as any;
            }
          })
        );
      } else if (isJSXNode(initValue)) {
        const newNodes: ChildNode[] = [];
        jsxRender[initValue.nodeType](
          initValue as any,
          context,
          regDispose,
          newNodes.push.bind(newNodes),
          parent
        );
        placeHolder.replaceWith(...newNodes);
      } else if (isIterable(initValue) && typeof initValue === 'object') {
        const newNodes: ChildNode[] = [];
        for (const child of initValue) {
          if (child != null) {
            renderInto(
              child,
              context,
              regDispose,
              newNodes.push.bind(newNodes),
              undefined
            );
          }
        }
        placeHolder.replaceWith(...newNodes);
      } else if (initValue instanceof Element) {
        placeHolder.replaceWith(initValue);
      }
      break;
    }
    default:
      // Data casts to string
      placeHolder.data = initValue as any;
      break;
  }
}

export function manualTemplate<TProps extends JSXProps>(
  templateCreator: () => Element,
  init: (
    element: Element,
    props: TProps,
    context: JSXContext,
    register: (dispose: Disposer) => void
  ) => void
): TemplateComponent<TProps> {
  const templateElement = templateCreator();
  const createElement = cloneNode.bind(templateElement, true) as () => Element;

  return (props, context, register) => {
    const element = createElement();
    init(element, props, context, register);
    return element;
  };
}
