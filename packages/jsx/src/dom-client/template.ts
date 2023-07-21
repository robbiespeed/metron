import type { Emitter } from 'metron-core/emitter.js';
import {
  emitterKey,
  isAtom,
  runAndSubscribe,
  toValueKey,
  untracked,
  type Atom,
} from 'metron-core/particle.js';
import {
  isJSXNode,
  type JSXNode,
  type JSXProps,
  type Component,
} from '../node.js';
import type { JSXContext } from '../context.js';
import { jsxRender, renderAtomListInto, renderInto } from './render.js';
import { assertOverride, isIterable } from '../utils.js';
import { isAtomList } from 'metron-core';
import {
  eventDelegatorContextKey,
  type DelegatedEventTarget,
  type EventHandler,
  EVENT_KEY_PREFIX,
  dataEventDelegatorContextKey,
  DATA_EVENT_KEY_PREFIX,
  type DataEventHandler,
} from './events.js';

interface InitDescriptor<TProps extends JSXProps = Record<string, unknown>> {
  props?: { key: string; initKey: keyof TProps }[];
  attributes?: { key: string; initKey: keyof TProps }[];
  events?: { key: string; initKey: keyof TProps }[];
  dataEvents?: { key: string; initKey: keyof TProps }[];
  setups?: (keyof TProps)[];
  children?: {
    [index: number]: InitDescriptor | keyof TProps;
    lastIndex: number;
  };
}

export interface Slot<T = unknown> extends Atom<T> {
  [slotBrandKey]: true;
  key: string;
}

type PropAccessor<TProps extends JSXProps> = {
  [K in keyof TProps]: Slot<TProps[K]>;
};

const fakeToValue = () => {
  throw new Error('Slot cannot be cast to value');
};

const fakeEmitter: Emitter<any> = (() => {
  throw new Error('Slot cannot emit');
}) as any;
(fakeEmitter as any)[emitterKey] = fakeEmitter;

const noOpTrap = () => false;
const empty = Object.create(null);
const propProxy: PropAccessor<any> = new Proxy(empty, {
  get(_, key: string) {
    return {
      [toValueKey]: fakeToValue,
      [emitterKey]: fakeEmitter,
      [slotBrandKey]: true,
      key,
    };
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

const slotBrandKey = Symbol('MetronJSXTemplateSlotBrand');

export function template<TProps extends JSXProps>(
  templateCreator: DynamicTemplateCreator<TProps>
): Component<TProps, Element> {
  const templateNode = templateCreator(propProxy);
  const [templateElement, descriptor] = renderTemplateNode(templateNode);
  return (props, context) => {
    const element = templateElement.cloneNode(true) as Element;
    if (descriptor !== undefined) {
      initElement(element, props, context, descriptor);
    }

    return element;
  };
}

export function statefulTemplate<
  TProps extends JSXProps,
  TState extends JSXProps
>(
  createState: (props: TProps, context: JSXContext) => TState,
  templateCreator: DynamicTemplateCreator<TState>
): Component<TProps, Element> {
  const templateNode = templateCreator(propProxy);
  const [templateElement, descriptor] = renderTemplateNode(templateNode);
  return (props, context) => {
    const state = createState(props, context);
    const element = templateElement.cloneNode(true) as Element;
    if (descriptor !== undefined) {
      initElement(element, state, context, descriptor);
    }

    return element;
  };
}

function isSlot(value: any): value is Slot {
  return value?.[slotBrandKey] === true;
}

function renderTemplateNode(
  intrinsic: JSXNode
): [Element, undefined | InitDescriptor] {
  // TODO: should allow handling of non intrinsic node and have their creation be delayed until init.
  // intrinsics nested inside other nodes like components could create a separate template
  if (intrinsic.nodeType !== 'Intrinsic') {
    throw new TypeError('Template may only contain intrinsic nodes');
  }

  const { children, ...templateProps } = intrinsic.props as Record<
    string,
    unknown
  >;

  const element = document.createElement(intrinsic.tag);
  let attributeDescriptors: InitDescriptor['attributes'];
  let propDescriptors: InitDescriptor['props'];
  let eventDescriptors: InitDescriptor['events'];
  let dataEventDescriptors: InitDescriptor['dataEvents'];
  let setupDescriptors: InitDescriptor['setups'];

  for (const [key, value] of Object.entries(templateProps)) {
    if (value === undefined) {
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
          (setupDescriptors ??= []).push(value.key);
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
            initKey: value.key,
          });
        } else {
          (element as any)[keyName] = value;
        }
        continue;
      case 'attr':
        if (isSlot(value)) {
          (attributeDescriptors ??= []).push({
            key: keyName,
            initKey: value.key,
          });
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
            initKey: value.key,
          });
        } else {
          throw new TypeError(
            'Templates may only use slots to register event handlers'
          );
        }
        continue;
      case 'on-data':
        if (isSlot(value)) {
          (dataEventDescriptors ??= []).push({
            key: keyName,
            initKey: value.key,
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

  let childDescriptors: InitDescriptor['children'];

  if (Array.isArray(children)) {
    const childNodes: ChildNode[] = [];
    const childrenCount = children.length;

    for (let i = 0; i < childrenCount; i++) {
      const child: unknown = children[i];
      if (isSlot(child)) {
        if (childDescriptors === undefined) {
          childDescriptors = { lastIndex: i, [i]: child.key };
        } else {
          childDescriptors.lastIndex = i;
          childDescriptors[i] = child.key;
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
  } else if (children !== undefined) {
    if (isSlot(children)) {
      childDescriptors = { lastIndex: 0, 0: children.key };
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

  const descriptor: InitDescriptor | undefined =
    attributeDescriptors ??
    childDescriptors ??
    dataEventDescriptors ??
    eventDescriptors ??
    setupDescriptors ??
    propDescriptors
      ? {
          attributes: attributeDescriptors,
          children: childDescriptors,
          dataEvents: dataEventDescriptors,
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
  { children, attributes, dataEvents, events, props, setups }: InitDescriptor
) {
  if (setups !== undefined) {
    for (const initKey of setups) {
      const setupHandler = initProps[initKey];
      // If not callable then it's okay to throw
      (setupHandler as Function)(element);
    }
  }

  const { addDisposer } = context;

  if (attributes !== undefined) {
    for (const { initKey, key } of attributes) {
      const initValue = initProps[initKey];

      if (initValue === undefined || initValue === false) {
        continue;
      } else if (initValue === true) {
        element.toggleAttribute(key, true);
      } else if (isAtom(initValue)) {
        const firstValue = untracked(initValue);

        if (firstValue === true) {
          element.toggleAttribute(key, true);
        } else if (firstValue !== undefined && firstValue !== false) {
          // setAttribute casts to string
          element.setAttribute(key, firstValue as any);
        }

        addDisposer(
          initValue[emitterKey](() => {
            const value = untracked(initValue);
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
  if (dataEvents !== undefined) {
    const hasDataEventDelegator = context.use(dataEventDelegatorContextKey);
    for (const { initKey, key } of dataEvents) {
      const value = initProps[initKey];

      if (value === undefined) {
        continue;
      }

      if (hasDataEventDelegator) {
        assertOverride<DataEventHandler<EventTarget>>(value);
        assertOverride<DelegatedEventTarget>(element);

        element[`${DATA_EVENT_KEY_PREFIX}:${key}`] = value;
      } else {
        assertOverride<DataEventHandler<EventTarget>>(value);
        const boundHandler = value.handler.bind(
          undefined,
          value.data
        ) as EventListener;
        element.addEventListener(key, boundHandler, {
          passive: true,
        });
      }
    }
  }
  if (events !== undefined) {
    const hasEventDelegator = context.use(eventDelegatorContextKey);
    for (const { initKey, key } of events) {
      const value = initProps[initKey];

      if (value === undefined) {
        continue;
      }

      if (hasEventDelegator) {
        assertOverride<EventHandler<EventTarget>>(value);
        assertOverride<DelegatedEventTarget>(element);

        element[`${EVENT_KEY_PREFIX}:${key}`] = value;
      } else {
        assertOverride<EventListener>(value);
        element.addEventListener(key, value, { passive: true });
      }
    }
  }
  if (props !== undefined) {
    for (const { key, initKey } of props) {
      const initValue = initProps[initKey];

      if (isAtom(initValue)) {
        addDisposer(
          runAndSubscribe(initValue, () => {
            // Expect the user knows what they are doing
            (element as any)[key] = untracked(initValue);
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
    const parent = element.lastChild === node ? element : null;
    let i = 0;
    while (node !== null) {
      const childDescriptor = children[i];
      switch (typeof childDescriptor) {
        case 'string':
          initSlottedChild(
            parent,
            initProps[childDescriptor],
            context,
            node as Text
          );
          break;
        case 'object':
          initElement(node as Element, initProps, context, childDescriptor);
          break;
      }

      node = i < lastIndex ? node.nextSibling : null;
      i++;
    }
  }
}

function initSlottedChild(
  parent: ParentNode | null,
  initValue: unknown,
  context: JSXContext,
  placeHolder: Text
) {
  switch (typeof initValue) {
    case 'undefined':
      break;
    case 'object': {
      // TODO: pass context
      if (isAtom(initValue)) {
        if (isAtomList(initValue)) {
          const newNodes: ChildNode[] = [];
          renderAtomListInto(
            parent,
            newNodes.push.bind(newNodes),
            initValue,
            context
          );
          placeHolder.replaceWith(...newNodes);
        } else {
          context.addDisposer(
            runAndSubscribe(initValue, () => {
              const value = untracked(initValue);
              if (value === undefined) {
                placeHolder!.data = '';
              } else {
                // Data casts to string
                placeHolder!.data = value as any;
              }
            })
          );
        }
      } else if (isJSXNode(initValue)) {
        const newNodes: ChildNode[] = [];
        jsxRender[initValue.nodeType](
          parent,
          newNodes.push.bind(newNodes),
          initValue as any,
          context
        );
        placeHolder.replaceWith(...newNodes);
      } else if (isIterable(initValue) && typeof initValue === 'object') {
        const newNodes: ChildNode[] = [];
        for (const child of initValue) {
          if (child != null) {
            renderInto(null, newNodes.push.bind(newNodes), child, context);
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
  init: (element: Element, props: TProps, context: JSXContext) => void
): Component<TProps, Element> {
  let templateElement: Element | undefined;
  return (props, context) => {
    const element = (templateElement ??= templateCreator()).cloneNode(
      true
    ) as Element;

    init(element, props, context);

    return element;
  };
}
