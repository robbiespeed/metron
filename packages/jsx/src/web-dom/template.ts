import { toValueKey, type Atom, emitterKey, type Emitter } from '@metron/core';
import {
  nodeBrandKey,
  type JsxNode,
  type JsxRawNode,
  isJsxNode,
  createStaticComponent,
  type JsxProps,
} from '../node.js';
import { isAtom, untracked } from '@metron/core/particle.js';
import { createEffect } from '@metron/core/effect.js';
import type { Disposer } from '@metron/core/emitter.js';
import { scheduleTask } from '@metron/core/schedulers.js';

interface InitDescriptor<TProps extends JsxProps = JsxProps> {
  index?: number;
  props?: { key: string; initKey: keyof TProps }[];
  attributes?: { key: string; initKey: keyof TProps }[];
  events?: { key: string; initKey: keyof TProps }[];
  nodes?: { index: number; initKey: keyof TProps }[];
  refs?: (keyof TProps)[];
  childDescriptors?: InitDescriptor[];
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
      initDynamic(element, props, disposers, descriptor);
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
  let refDescriptors: InitDescriptor['refs'];

  for (const [key, value] of Object.entries(templateProps)) {
    if (value === undefined) {
      continue;
    }

    let [keySpecifier, keyName] = key.split(':', 2) as [
      string,
      string | undefined
    ];
    if (keySpecifier === key) {
      keyName = keySpecifier;
      keySpecifier = 'attr';
    }

    if (keySpecifier === 'ref') {
      if (isSlot(value)) {
        (refDescriptors ??= []).push(value.key);
        continue;
      } else {
        throw new TypeError('Templates may only use slots to register refs');
      }
    } else if (keyName === undefined) {
      throw new Error(`Specifier "${keySpecifier}" must have a keyName`);
    }

    switch (keySpecifier) {
      case 'prop':
        if (isSlot(value)) {
          (propDescriptors ??= []).push({
            key: keyName,
            initKey: value.key,
          });
        } else {
          (element as any)[keyName] = value;
        }
        break;
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
        break;
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
        break;
      default:
        throw new TypeError(`Unsupported specifier "${keySpecifier}"`);
    }
  }

  let nodeDescriptors: InitDescriptor['nodes'];
  let childDescriptors: InitDescriptor['childDescriptors'];

  if (Array.isArray(children)) {
    const childNodes: ChildNode[] = [];
    const childrenCount = children.length;

    for (let i = 0; i < childrenCount; i++) {
      const child: unknown = children[i];
      if (isSlot(child)) {
        childNodes.push(document.createTextNode(''));
        (nodeDescriptors ??= []).push({
          index: i,
          initKey: child.key,
        });
      } else if (isJsxNode(child)) {
        const [childElement, childDescriptor] = renderTemplateNode(child);
        if (childDescriptor !== undefined) {
          childDescriptor.index = i;
          (childDescriptors ??= []).push(childDescriptor);
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
      (nodeDescriptors ??= []).push({
        index: 0,
        initKey: children.key,
      });
      element.appendChild(document.createTextNode(''));
    } else if (isJsxNode(children)) {
      const [childElement, childDescriptor] = renderTemplateNode(children);
      if (childDescriptor !== undefined) {
        (childDescriptors ??= []).push(childDescriptor);
      }
      element.appendChild(childElement);
    } else if (typeof children === 'string') {
      element.textContent = children;
    }
  }

  const descriptor =
    attributeDescriptors ??
    childDescriptors ??
    eventDescriptors ??
    nodeDescriptors ??
    refDescriptors ??
    propDescriptors
      ? {
          childDescriptors,
          attributes: attributeDescriptors,
          events: eventDescriptors,
          nodes: nodeDescriptors,
          refs: refDescriptors,
          props: propDescriptors,
        }
      : undefined;

  return [element, descriptor];
}

function initDynamic(
  element: Element,
  initProps: JsxProps,
  disposers: Disposer[],
  { childDescriptors, attributes, events, nodes, props, refs }: InitDescriptor
) {
  if (refs !== undefined) {
    for (const initKey of refs) {
      const refSetter = initProps[initKey];
      // If not callable then it's okay to throw
      scheduleTask(() => (refSetter as any)(element));
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
          createEffect(initValue, () => {
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
  if (nodes !== undefined) {
    // TODO: handle JSX
    for (const { index, initKey } of nodes) {
      const initValue = initProps[initKey];

      if (initValue === undefined) {
        continue;
      }

      const node = element.childNodes[index] as Text;

      if (isAtom(initValue)) {
        disposers.push(
          createEffect(initValue, () => {
            const value = untracked(initValue);
            if (value === undefined) {
              node.data = '';
            } else {
              // Data casts to string
              node.data = value as any;
            }
          })
        );
      } else {
        // Data casts to string
        node.data = initValue as any;
      }
    }
  }
  if (props !== undefined) {
    for (const { key, initKey } of props) {
      const initValue = initProps[initKey];

      if (isAtom(initValue)) {
        disposers.push(
          createEffect(initValue, () => {
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
  if (childDescriptors !== undefined) {
    for (const childDescriptor of childDescriptors) {
      const { index } = childDescriptor;
      initDynamic(
        (index === undefined
          ? element.firstChild
          : element.childNodes[index]) as Element,
        initProps,
        disposers,
        childDescriptor
      );
    }
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
