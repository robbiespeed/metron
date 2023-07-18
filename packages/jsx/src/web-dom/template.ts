import type { Disposer, Emitter } from 'metron-core/emitter.js';
import {
  emitterKey,
  isAtom,
  runAndSubscribe,
  toValueKey,
  untracked,
  type Atom,
} from 'metron-core/particle.js';
import {
  createStaticComponent,
  isJsxNode,
  nodeBrandKey,
  type JsxNode,
  type JsxProps,
  type JsxRawNode,
} from '../node.js';
import { jsxRender, renderAtomListInto, renderInto } from './render.js';
import { isIterable } from '../utils.js';
import { isAtomList } from 'metron-core';

interface InitDescriptor<TProps extends JsxProps = JsxProps> {
  props?: { key: string; initKey: keyof TProps }[];
  attributes?: { key: string; initKey: keyof TProps }[];
  events?: { key: string; initKey: keyof TProps }[];
  setups?: (keyof TProps)[];
  children?: {
    [index: number]: InitDescriptor | keyof TProps;
    lastIndex: number;
  };
}

interface Slot<T = unknown> extends Atom<T> {
  [slotBrandKey]: true;
  key: string;
}

type PropAccessor<TProps extends JsxProps> = {
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

interface DynamicTemplateCreator<TProps extends JsxProps> {
  (props: PropAccessor<TProps>): JsxNode;
}

const slotBrandKey = Symbol('MetronJSXTemplateSlotBrand');

export function template<TProps extends JsxProps>(
  templateCreator: DynamicTemplateCreator<TProps>
): (props: TProps) => JsxRawNode {
  const templateNode = templateCreator(propProxy);
  const [templateElement, descriptor] = renderTemplateNode(templateNode);
  return createStaticComponent((props: TProps) => {
    const element = templateElement.cloneNode(true) as Element;
    let disposers: Disposer[] | undefined;
    if (descriptor !== undefined) {
      disposers = [];
      initElement(element, props, disposers, descriptor);
    }

    return {
      [nodeBrandKey]: true,
      nodeType: 'Raw',
      value: element,
      disposer: () => {
        if (disposers === undefined) {
          return;
        }
        for (const d of disposers) {
          d();
        }
        disposers = undefined;
      },
    };
  });
}

function isSlot(value: any): value is Slot {
  return value?.[slotBrandKey] === true;
}

function renderTemplateNode(
  intrinsic: JsxNode
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
  let setupDescriptors: InitDescriptor['setups'];

  for (const [key, value] of Object.entries(templateProps)) {
    if (value === undefined) {
      continue;
    }

    let [keySpecifier, _keyName] = key.split(':', 2) as [
      string,
      string | undefined
    ];
    if (keySpecifier === key) {
      _keyName = keySpecifier;
      keySpecifier = 'attr';
    }
    const keyName = _keyName ?? keySpecifier;

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
      } else if (isJsxNode(child)) {
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
    } else if (isJsxNode(children)) {
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
    eventDescriptors ??
    setupDescriptors ??
    propDescriptors
      ? {
          attributes: attributeDescriptors,
          children: childDescriptors,
          events: eventDescriptors,
          setups: setupDescriptors,
          props: propDescriptors,
        }
      : undefined;

  return [element, descriptor];
}

function initElement(
  element: Element,
  initProps: JsxProps,
  disposers: Disposer[],
  { children, attributes, events, props, setups }: InitDescriptor
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

        disposers.push(
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
  if (events !== undefined) {
    for (const { initKey, key } of events) {
      const initValue = initProps[initKey];

      if (isAtom(initValue)) {
        let eventHandler: EventListenerOrEventListenerObject | undefined;
        disposers.push(
          runAndSubscribe(initValue, () => {
            if (eventHandler) {
              element.removeEventListener(key, eventHandler);
            }

            // Defer correctness to addEventListener error handling
            eventHandler = untracked(initValue) as any;
            if (eventHandler !== undefined) {
              element.addEventListener(key, eventHandler);
            }
          })
        );
      } else if (initValue !== undefined) {
        element.addEventListener(key, initValue as any);
      }
    }
  }
  if (props !== undefined) {
    for (const { key, initKey } of props) {
      const initValue = initProps[initKey];

      if (isAtom(initValue)) {
        disposers.push(
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
            node as Text,
            disposers
          );
          break;
        case 'object':
          initElement(node as Element, initProps, disposers, childDescriptor);
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
  placeHolder: Text,
  disposers: Disposer[]
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
            disposers,
            initValue,
            {}
          );
          placeHolder.replaceWith(...newNodes);
        } else {
          disposers.push(
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
      } else if (isJsxNode(initValue)) {
        const newNodes: ChildNode[] = [];
        jsxRender[initValue.nodeType](
          parent,
          newNodes.push.bind(newNodes),
          disposers,
          initValue as any,
          {}
        );
        placeHolder.replaceWith(...newNodes);
      } else if (isIterable(initValue) && typeof initValue === 'object') {
        const newNodes: ChildNode[] = [];
        for (const child of initValue) {
          if (child != null) {
            renderInto(
              null,
              newNodes.push.bind(newNodes),
              disposers,
              child,
              {}
            );
          }
        }
        placeHolder.replaceWith(...newNodes);
      }
      break;
    }
    default:
      // Data casts to string
      placeHolder.data = initValue as any;
      break;
  }
}

export function manualTemplate<TProps extends JsxProps>(
  templateCreator: () => Element,
  init: (element: Element, props: TProps) => Disposer | undefined
): (props: TProps) => JsxRawNode {
  let templateElement: Element | undefined;
  return createStaticComponent((props: TProps) => {
    const element = (templateElement ??= templateCreator()).cloneNode(
      true
    ) as Element;

    return {
      [nodeBrandKey]: true,
      nodeType: 'Raw',
      value: element,
      disposer: init(element, props),
    };
  });
}
