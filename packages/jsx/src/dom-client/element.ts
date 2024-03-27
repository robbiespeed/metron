import { isAtom, type Atom, EMITTER } from '@metron/core/atom.js';
import { type Context, type Register } from '../context.js';
import { assertOverride } from '../utils.js';
import { run } from './runtime.js';
import {
  isJSXNode,
  type Component,
  type JSXComponentNode,
  type JSXIntrinsicNode,
  NODE_TYPE_COMPONENT,
  NODE_TYPE_INTRINSIC,
  NODE_TYPE_UNSAFE,
  type JSXProps,
  type RenderFn,
} from '../node.js';
import {
  initElementFromTemplateBlueprints,
  type TemplateBlueprints,
} from './template.js';
import type { Disposer } from '@metron/core/shared.js';
import { SLOT_TYPE, type PossibleSlot } from '../slot.js';

// TODO: Explore adding new INST codes to reduce amount of init functions
// nullish check is repeated in several places

export function initAttributeFromKey(
  name: string,
  stateKey: string,
  element: Element,
  state: Record<string, unknown>,
  register: Register
): undefined {
  const value = state[stateKey];
  if (value == null) {
    return;
  }

  if (isAtom(value)) {
    register(syncElementAttribute(element, name, value));
  } else {
    // setAttribute casts to string
    element.setAttribute(name, value as any);
  }
}

export function initAttributeFromValueFn(
  name: string,
  valueFn: (state: unknown) => unknown,
  element: Element,
  state: Record<string, unknown>,
  register: Register
): undefined {
  const value = valueFn(state);
  if (value == null) {
    return;
  }

  if (isAtom(value)) {
    register(syncElementAttribute(element, name, value));
  } else {
    // setAttribute casts to string
    element.setAttribute(name, value as any);
  }
}

export function syncElementAttribute(
  element: Element,
  name: string,
  atom: Atom<unknown>
): Disposer {
  const firstValue = atom.unwrap();

  if (firstValue != null) {
    element.setAttribute(name, firstValue as any);
  }

  return atom[EMITTER].subscribe(() => {
    const value = atom.unwrap();
    if (value != null) {
      element.setAttribute(name, value as any);
    } else {
      element.removeAttribute(name);
    }
  });
}

// TODO: bench this vs raw arrow and syncElementAttribute
// function handleAttributeChange(
//   element: Element,
//   name: string,
//   atom: Atom<unknown>
// ): undefined {
//   const value = atom.unwrap();
//   if (value != null) {
//     element.setAttribute(name, value as any);
//   } else {
//     element.removeAttribute(name);
//   }
// }

export function initAttributeToggleFromKey(
  name: string,
  stateKey: string,
  element: Element,
  state: Record<string, unknown>,
  register: Register
): undefined {
  const value = state[stateKey];
  if (value == null) {
    return;
  }

  if (value === true || value) {
    element.toggleAttribute(name, true);
  } else if (isAtom(value)) {
    register(syncElementAttributeToggle(element, name, value));
  }
}

export function initAttributeToggleFromValueFn(
  name: string,
  valueFn: (state: unknown) => unknown,
  element: Element,
  state: Record<string, unknown>,
  register: Register
): undefined {
  const value = valueFn(state);
  if (value == null) {
    return;
  }

  if (value === true || value) {
    element.toggleAttribute(name, true);
  } else if (isAtom(value)) {
    register(syncElementAttributeToggle(element, name, value));
  }
}

export function syncElementAttributeToggle(
  element: Element,
  name: string,
  atom: Atom<unknown>
): Disposer {
  const firstValue = atom.unwrap();
  if (firstValue === true || firstValue) {
    element.toggleAttribute(name, true);
  }

  return atom[EMITTER].subscribe(() => {
    element.toggleAttribute(name, !!atom.unwrap());
  });
}

export function initSyncAttributeToggle(
  name: string,
  atom: Atom<unknown>,
  element: Element,
  state: Record<string, unknown>,
  register: Register
): undefined {
  register(syncElementAttributeToggle(element, name, atom));
}

export function initPropFromKey(
  name: string,
  stateKey: string,
  element: Element,
  state: Record<string, unknown>,
  register: Register
): undefined {
  const value = state[stateKey];

  if (value != null && isAtom(value)) {
    register(syncElementProp(element, name, value));
  } else {
    // Expect the user knows what they are doing
    (element as any)[name] = value;
  }
}

export function initPropFromValueFn(
  name: string,
  valueFn: (state: Record<string, unknown>) => unknown,
  element: Element,
  state: Record<string, unknown>,
  register: Register
): undefined {
  const value = valueFn(state);

  if (value != null && isAtom(value)) {
    register(syncElementProp(element, name, value));
  } else {
    // Expect the user knows what they are doing
    (element as any)[name] = value;
  }
}

export function initSyncElementProp(
  name: string,
  atom: Atom<unknown>,
  element: Element,
  state: Record<string, unknown>,
  register: Register
): undefined {
  register(syncElementProp(element, name, atom));
}

export function syncElementProp(
  element: Element,
  name: string,
  atom: Atom<unknown>
): Disposer {
  (element as any)[name] = atom.unwrap();
  return atom[EMITTER].subscribe(() => {
    (element as any)[name] = atom.unwrap();
  });
}

export function initProp(
  name: string,
  value: unknown,
  element: Element,
  state: Record<string, unknown>,
  register: Register
): undefined {
  if (value != null && isAtom(value)) {
    register(syncElementProp(element, name, value));
  } else {
    // Expect the user knows what they are doing
    (element as any)[name] = value;
  }
}

export function initEventFromKey(
  name: string,
  stateKey: string,
  element: Element,
  state: Record<string, unknown>
): undefined {
  const value = state[stateKey];
  if (value == null) {
    return;
  }

  element.addEventListener(name, (event) => {
    (value as EventListener)(event);
    run();
  });
}

export function initEventFromValueFn(
  name: string,
  valueFn: (state: Record<string, unknown>) => unknown,
  element: Element,
  state: Record<string, unknown>
): undefined {
  const value = valueFn(state);
  if (value == null) {
    return;
  }

  element.addEventListener(name, (event) => {
    (value as EventListener)(event);
    run();
  });
}

export function initEvent(
  name: string,
  value: EventListener,
  element: Element
): undefined {
  element.addEventListener(name, (event) => {
    value(event);
    run();
  });
}

export interface Setup {
  (element: Element, register: Register): undefined;
}

export function initSetupFromKey(
  name: string,
  stateKey: string,
  element: Element,
  state: Record<string, unknown>,
  register: Register
): undefined {
  const value = state[stateKey];
  if (value == null) {
    return;
  }

  assertOverride<Setup>(value);
  value(element, register);
}

export function initSetupFromValueFn(
  name: string,
  valueFn: (state: Record<string, unknown>) => Setup,
  element: Element,
  state: Record<string, unknown>,
  register: Register
): undefined {
  const value = valueFn(state);
  if (value == null) {
    return;
  }
  value(element, register);
}

export function initSetup(
  name: string,
  setup: Setup,
  element: Element,
  state: Record<string, unknown>,
  register: Register
): undefined {
  setup(element, register);
}

export function initBlueprintValueFromKey(
  stateKey: string,
  parent: Element,
  state: Record<string, unknown>,
  context: Context
): undefined {
  const initValue = state[stateKey];
  if (initValue == null) {
    return;
  }
  insertValue(initValue, context, parent, null);
}

export function initBlueprintValueFromValueFn(
  valueFn: (state: unknown) => unknown,
  parent: Element,
  state: Record<string, unknown>,
  context: Context
): undefined {
  const initValue = valueFn(state);
  if (initValue == null) {
    return;
  }
  insertValue(initValue, context, parent, null);
}

export function initBlueprintChildValueFromKey(
  stateKey: string,
  marker: ChildNode,
  state: Record<string, unknown>,
  context: Context
): undefined {
  const initValue = state[stateKey];
  if (initValue == null) {
    return;
  }
  insertValue(initValue, context, marker.parentNode!, marker);
}

declare const a: [1, 2, [3], 4];

a.flat();

export function initBlueprintChildValueFromValueFn(
  valueFn: (state: unknown) => unknown,
  marker: ChildNode,
  state: Record<string, unknown>,
  context: Context
): undefined {
  const initValue = valueFn(state);
  if (initValue == null) {
    return;
  }
  insertValue(initValue, context, marker.parentNode!, marker);
}

function buildSlottedProps(
  propEntries: [key: string | symbol, value: unknown][],
  state: Record<string, unknown>
) {
  const builtProps: Record<string | symbol, unknown> = {};
  for (let i = 0; i < propEntries.length; i++) {
    const [key, value] = propEntries[i]!;
    assertOverride<PossibleSlot>(value);
    const slotType = value?.[SLOT_TYPE];

    builtProps[key] =
      slotType === undefined
        ? value
        : slotType === 0
        ? state[value!.key]
        : value!.valueFn(state);
  }
  return builtProps;
}

export function initBlueprintComponent(
  propEntries: [key: string | symbol, value: unknown][],
  component: Component,
  marker: ChildNode,
  state: Record<string, unknown>,
  context: Context
) {
  const res = component(buildSlottedProps(propEntries, state), context);
  if (res == null) {
    return;
  }
  insertValue(res, context, marker.parentNode!, marker);
}

export function initBlueprintUnsafeRender(
  propEntries: [key: string | symbol, value: unknown][],
  renderFn: RenderFn<JSXProps>,
  marker: ChildNode,
  state: Record<string, unknown>,
  context: Context
) {
  renderFn(
    buildSlottedProps(propEntries, state),
    context,
    marker.parentNode!,
    marker
  );
}

export function initBlueprintInnerTemplate(
  propEntries: [key: string | symbol, value: unknown][],
  innerBlueprints: TemplateBlueprints,
  element: Element,
  state: Record<string, unknown>,
  context: Context
) {
  initElementFromTemplateBlueprints(
    element,
    innerBlueprints,
    buildSlottedProps(propEntries, state),
    context
  );
}

const isArray: (value: unknown) => value is unknown[] = Array.isArray;

function insertComponentJSX(
  node: JSXComponentNode,
  context: Context,
  parent: ParentNode,
  marker: Node | null
) {
  const children = node.tag(node.props, context);
  if (children != null) {
    insertValue(children, context, parent, marker);
  }
}

function insertIntrinsicJSX(
  node: JSXIntrinsicNode,
  context: Context,
  parent: ParentNode,
  marker: Node | null
) {
  const { children, ...props } = node.props as Record<string, unknown>;

  const element = document.createElement(node.tag);
  const { register } = context;

  for (const key of Object.getOwnPropertyNames(props)) {
    const value = props[key];
    if (value == null) {
      continue;
    }
    let [keySpecifier, keyName] = key.split(':', 2) as [string, string];
    if (keySpecifier === key) {
      if (keySpecifier === 'class') {
        keyName = 'className';
        keySpecifier = 'prop';
      } else {
        keyName = keySpecifier;
        keySpecifier = 'attr';
      }
    }

    switch (keySpecifier) {
      case 'setup':
        (value as any)(element, register);
        continue;
      case 'prop':
        if (isAtom(value)) {
          register(syncElementProp(element, keyName, value));
        } else {
          // Expect the user knows what they are doing
          (element as any)[keyName] = value;
        }
        continue;
      case 'attr':
        if (isAtom(value)) {
          register(syncElementAttribute(element, keyName, value));
        } else {
          // setAttribute casts to string
          element.setAttribute(keyName, value as any);
        }
        continue;
      case 'toggle':
        if (value === true || value) {
          element.toggleAttribute(keyName, true);
        } else if (isAtom(value)) {
          register(syncElementAttributeToggle(element, keyName, value));
        }
        continue;
      case 'on':
        initEvent(keyName, value as any, element);
        continue;
      default:
        throw new TypeError(`Unsupported specifier "${keySpecifier}"`);
    }
  }

  if (children != null) {
    insertValue(children, context, element, element);
  }

  parent.insertBefore(element, marker);
}

export function insertValue(
  value: {},
  context: Context,
  parent: ParentNode,
  marker: Node | null
): undefined {
  if (typeof value === 'object') {
    if (isJSXNode(value)) {
      switch (value.nodeType) {
        case NODE_TYPE_INTRINSIC:
          insertIntrinsicJSX(value, context, parent, marker);
          return;
        case NODE_TYPE_COMPONENT:
          insertComponentJSX(value, context, parent, marker);
          return;
        case NODE_TYPE_UNSAFE:
          value.tag(value.props, context, parent, marker);
          return;
      }
      // TODO: report warning of ignored unknown nodeType
    } else if (isArray(value)) {
      const childMarker = marker === parent ? null : marker;
      for (let i = 0; i < length; i++) {
        const childValue = value[i];
        if (childValue != null) {
          insertValue(childValue, context, parent, childMarker);
        }
      }
      return;
    } else if (isAtom(value)) {
      insertAtom(value, context, parent, marker);
      return;
    } else if (value instanceof Node) {
      if (value.parentNode === null) {
        parent.insertBefore(value, marker);
      }
      // TODO: report warning if value has parent
      return;
    }
  }
  // TODO: report warning on string conversion (option to ignore numeric?)
  // createTextNode casts to string
  parent.insertBefore(document.createTextNode(value as any), marker);
}

export function insertAtom(
  atom: Atom<unknown>,
  context: Context,
  parent: ParentNode,
  marker: Node | null
) {
  const firstValue = atom.unwrap();
  const headMarker = document.createTextNode('');
  parent.insertBefore(headMarker, marker);

  if (firstValue != null) {
    insertValue(firstValue, context, parent, marker);
  }

  context.register(
    atom[EMITTER].subscribe(() => {
      removeNodesBetween(headMarker, marker);
      const value = atom.unwrap();
      if (value != null) {
        insertValue(value, context, parent, marker);
      }
    })
  );
}

export function removeNodesBetween(start: Node, end: Node | null) {
  let node = start.nextSibling;
  while (node !== end) {
    node!.remove();
    node = start.nextSibling;
  }
}

export function insertNodes(
  nodes: ChildNode[],
  start: number,
  end: number,
  parent: ParentNode,
  tail: null | ChildNode
) {
  for (; start < end; start++) {
    parent.insertBefore(nodes[start]!, tail);
  }
}
