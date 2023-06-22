import { toValueKey, type Atom, emitterKey, type Emitter } from '@metron/core';
import {
  nodeBrandKey,
  type JsxNode,
  type JsxRawNode,
  isJsxNode,
  createStaticComponent,
} from '../node.js';
import { EVENT_HANDLER_PREFIX, EVENT_HANDLER_PREFIX_LENGTH } from './render.js';
import { untracked } from '@metron/core/particle';
import { createEffect } from '@metron/core/effect';
import type { Disposer } from '@metron/core/emitter';

// TODO: type the message
type EventHandler = () => void;

type TemplatePropValues = undefined | Element | string | EventHandler;

interface TemplateProps {
  [key: string]: TemplatePropValues | Atom<TemplatePropValues>;
}

interface PropsDescriptor<TProps extends TemplateProps = any> {
  // nestedPath?: [number, ...number[]];
  index?: number;
  atomAttributes?: { attribute: string; key: AtomPropKeys<TProps> }[];
  atomNodes?: { index: number; key: AtomPropKeys<TProps> }[];
  atomEvents?: { eventName: string; key: AtomPropKeys<TProps> }[];
  staticAttributes?: { attribute: string; key: StaticPropKeys<TProps> }[];
  staticNodes?: { index: number; key: StaticPropKeys<TProps> }[];
  staticEvents?: { eventName: string; key: StaticPropKeys<TProps> }[];
  childDescriptors?: PropsDescriptor[];
}

type AtomPropKeys<TProps extends object> = {
  [P in keyof TProps]: TProps[P] extends Atom ? P : never;
}[keyof TProps];

type StaticPropKeys<TProps extends object> = {
  [P in keyof TProps]: TProps[P] extends Atom
    ? never
    : Atom<any> extends TProps[P]
    ? never
    : P;
}[keyof TProps];

type AtomProps<TProps extends object> = Pick<TProps, AtomPropKeys<TProps>>;
type StaticProps<TProps extends object> = Pick<TProps, StaticPropKeys<TProps>>;

interface Slot<T = unknown, TIsAtom extends boolean = false> extends Atom<T> {
  [slotBrandKey]: true;
  key: string;
  isAtom: TIsAtom;
}

type PropAccessor<TProps extends object, TIsAtom extends boolean = false> = {
  [K in keyof TProps]: Slot<TProps[K], TIsAtom>;
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
const staticPropProxy = new Proxy(empty, {
  get(_, key: string): Slot<any, false> {
    return {
      [toValueKey]: fakeToValue,
      [emitterKey]: fakeEmitter,
      [slotBrandKey]: true,
      key,
      isAtom: false,
    };
  },
  set: noOpTrap,
  has: noOpTrap,
  setPrototypeOf: noOpTrap,
  defineProperty: noOpTrap,
  deleteProperty: noOpTrap,
}) as PropAccessor<any, false>;

const atomPropProxy = new Proxy(empty, {
  get(_, key: string): Slot<any, true> {
    return {
      [toValueKey]: fakeToValue,
      [emitterKey]: fakeEmitter,
      [slotBrandKey]: true,
      key,
      isAtom: true,
    };
  },
  set: noOpTrap,
  has: noOpTrap,
  setPrototypeOf: noOpTrap,
  defineProperty: noOpTrap,
  deleteProperty: noOpTrap,
}) as PropAccessor<any, true>;

interface DynamicTemplateCreator<TProps extends TemplateProps> {
  (
    staticProps: PropAccessor<StaticProps<TProps>, false>,
    atomProps: PropAccessor<AtomProps<TProps>, true>
  ): JsxNode;
}

const slotBrandKey = Symbol('MetronJSXTemplateSlotBrand');

export function template<TProps extends TemplateProps>(
  templateCreator: DynamicTemplateCreator<TProps>
): (props: TProps) => JsxRawNode {
  const templateNode = templateCreator(staticPropProxy, atomPropProxy);
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
): [Element, undefined | PropsDescriptor] {
  if (intrinsic.nodeType !== 'Intrinsic') {
    throw new TypeError('Template may only contain intrinsic nodes');
  }

  const { children, ...props } = intrinsic.props as Record<string, unknown>;

  const element = document.createElement(intrinsic.tag);
  let atomAttributes: PropsDescriptor['atomAttributes'];
  let staticAttributes: PropsDescriptor['staticAttributes'];
  let atomEvents: PropsDescriptor['atomEvents'];
  let staticEvents: PropsDescriptor['staticEvents'];

  for (const [key, value] of Object.entries(props)) {
    if (isSlot(value)) {
      if (key.startsWith(EVENT_HANDLER_PREFIX)) {
        const eventName = key.slice(EVENT_HANDLER_PREFIX_LENGTH);
        (value.isAtom ? (atomEvents ??= []) : (staticEvents ??= [])).push({
          eventName,
          key: value.key,
        });
      } else {
        (value.isAtom
          ? (atomAttributes ??= [])
          : (staticAttributes ??= [])
        ).push({
          attribute: key,
          key: value.key,
        });
      }
    } else if (key.startsWith(EVENT_HANDLER_PREFIX)) {
      if (typeof value === 'function') {
        const eventName = key.slice(EVENT_HANDLER_PREFIX_LENGTH);
        element.addEventListener(eventName, value as () => void);
      } else {
        throw new TypeError('Event handler must be a function');
      }
    } else {
      switch (typeof value) {
        case 'string':
          element.setAttribute(key, String(value));
          break;
        case 'boolean':
          element.toggleAttribute(key, value);
          break;
      }
    }
  }

  let atomNodes: PropsDescriptor['atomNodes'];
  let staticNodes: PropsDescriptor['staticNodes'];
  let childDescriptors: PropsDescriptor['childDescriptors'];

  if (Array.isArray(children)) {
    const childNodes: ChildNode[] = [];
    const childrenCount = children.length;

    for (let i = 0; i < childrenCount; i++) {
      const child = children[i];
      if (isSlot(child)) {
        childNodes.push(document.createTextNode(''));
        (child.isAtom ? (atomNodes ??= []) : (staticNodes ??= [])).push({
          index: i,
          key: child.key,
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
      (children.isAtom ? (atomNodes ??= []) : (staticNodes ??= [])).push({
        index: 0,
        key: children.key,
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
    childDescriptors ??
    staticAttributes ??
    staticEvents ??
    staticNodes ??
    atomAttributes ??
    atomEvents ??
    atomNodes
      ? {
          childDescriptors,
          atomAttributes,
          atomEvents,
          atomNodes,
          staticAttributes,
          staticEvents,
          staticNodes,
        }
      : undefined;

  return [element, descriptor];
}

function initDynamic(
  element: Element,
  props: TemplateProps,
  disposers: Disposer[],
  {
    atomAttributes,
    atomEvents,
    atomNodes,
    childDescriptors,
    staticAttributes,
    staticEvents,
    staticNodes,
  }: PropsDescriptor
) {
  if (atomAttributes !== undefined) {
    for (const { key, attribute } of atomAttributes) {
      const atom = props[key] as Atom<TemplatePropValues>;

      disposers.push(
        createEffect(atom, () => {
          const value = untracked(atom);
          switch (typeof value) {
            case 'string':
              element.setAttribute(attribute, value);
              break;
            case 'boolean':
              element.toggleAttribute(attribute, value);
              break;
            case 'undefined':
              element.removeAttribute(attribute);
              break;
          }
        })
      );
    }
  }
  if (atomEvents !== undefined) {
    for (const { key, eventName } of atomEvents) {
      const atom = props[key] as Atom<(() => void) | undefined>;

      let eventHandler: (() => void) | undefined;

      disposers.push(
        createEffect(atom, () => {
          if (eventHandler) {
            element.removeEventListener(eventName, eventHandler);
          }

          eventHandler = untracked(atom);
          if (eventHandler !== undefined) {
            element.addEventListener(eventName, eventHandler);
          }
        })
      );
    }
  }
  if (atomNodes !== undefined) {
    for (const { index, key } of atomNodes) {
      const atom = props[key] as Atom<string | undefined>;
      const node = index < 0 ? element : (element.childNodes[index] as Text);

      disposers.push(
        createEffect(atom, () => {
          const value = untracked(atom);
          if (value === undefined) {
            node.textContent = '';
          } else {
            node.textContent = value;
          }
        })
      );
    }
  }
  if (staticAttributes !== undefined) {
    for (const { attribute, key } of staticAttributes) {
      const value = props[key] as string | undefined;
      switch (typeof value) {
        case 'string':
          element.setAttribute(attribute, value);
          break;
        case 'boolean':
          element.toggleAttribute(attribute, value);
          break;
      }
    }
  }
  if (staticEvents !== undefined) {
    for (const { eventName, key } of staticEvents) {
      const eventHandler = props[key] as () => void | undefined;
      if (eventHandler !== undefined) {
        element.addEventListener(eventName, eventHandler);
      }
    }
  }
  if (staticNodes !== undefined) {
    for (const { index, key } of staticNodes) {
      const value = props[key] as unknown;

      switch (typeof value) {
        case 'string':
          (element.childNodes[index] as Text).data = value;
          break;
        case 'object': {
          if (isJsxNode(value)) {
          } else {
          }
          break;
        }
        case 'undefined':
          break;
        default:
          (element.childNodes[index] as Text).data = String(value);
          break;
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
        props,
        disposers,
        childDescriptor
      );
    }
  }
}

export function manualTemplate<TProps extends object>(
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
