import {
  isAtom,
  runAndSubscribe,
  type Atom,
  EMITTER,
} from '@metron/core/atom.js';
import type { Context, Register } from '../context.js';
import { assertOverride } from '../utils.js';
import { run } from './runtime.js';

export type NodeInitializer = (
  node: Node,
  initState: Record<string, unknown>,
  register: Register
) => undefined;

export type NodeContextInitializer = (
  node: Node,
  initState: Record<string, unknown>,
  context: Context
) => undefined;

export function initAttributeFromState(
  name: string,
  stateKey: string,
  element: Element,
  initState: Record<string, unknown>,
  register: Register
): undefined {
  const value = initState[stateKey];
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
) {
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

export function initSyncAttribute(
  name: string,
  atom: Atom<unknown>,
  element: Element,
  initState: Record<string, unknown>,
  register: Register
) {
  register(syncElementAttribute(element, name, atom));
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

export function initAttributeToggleFromState(
  name: string,
  stateKey: string,
  element: Element,
  initState: Record<string, unknown>,
  register: Register
): undefined {
  const value = initState[stateKey];
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
) {
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
  initState: Record<string, unknown>,
  register: Register
) {
  register(syncElementAttributeToggle(element, name, atom));
}

export function initPropFromState(
  name: string,
  stateKey: string,
  element: Element,
  initState: Record<string, unknown>,
  register: Register
): undefined {
  const value = initState[stateKey];

  if (value != null && isAtom(value)) {
    register(syncElementProp(element, name, value));
  } else {
    // Expect the user knows what they are doing
    (element as any)[name] = value;
  }
}

export function syncElementProp(
  element: Element,
  name: string,
  atom: Atom<unknown>
) {
  (element as any)[name] = atom.unwrap();
  return atom[EMITTER].subscribe(() => {
    (element as any)[name] = atom.unwrap();
  });
}

export function initProp(
  name: string,
  value: unknown,
  element: Element,
  initState: Record<string, unknown>,
  register: Register
) {
  if (value != null && isAtom(value)) {
    register(syncElementProp(element, name, value));
  } else {
    // Expect the user knows what they are doing
    (element as any)[name] = value;
  }
}

export function initEventFromState(
  name: string,
  stateKey: string,
  element: Element,
  initState: Record<string, unknown>
): undefined {
  const value = initState[stateKey];
  if (value == null) {
    return;
  }

  assertOverride<EventListener>(value);
  element.addEventListener(name, (event) => {
    value(event);
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

export function initSetupFromState(
  stateKey: string,
  element: Element,
  initState: Record<string, unknown>,
  register: Register
) {
  const value = initState[stateKey];
  if (value == null) {
    return;
  }

  assertOverride<Setup>(value);
  value(element, register);
}

export function initSetup(
  setup: Setup,
  element: Element,
  initState: Record<string, unknown>,
  register: Register
) {
  setup(element, register);
}

export function initPlaceholderFromState(
  stateKey: string,
  placeHolder: Text,
  initState: Record<string, unknown>,
  register: Register
) {
  const initValue = initState[stateKey];
  if (initValue == null) {
    return;
  }

  // TODO DOM node and JSX

  if (isAtom(initValue)) {
    register(
      runAndSubscribe(initValue, () => {
        const value = initValue.unwrap();
        if (value === undefined) {
          placeHolder.data = '';
        } else {
          // Data casts to string
          placeHolder.data = value as any;
        }
      })
    );
    return;
  }

  // Data casts to string
  placeHolder.data = initValue as string;
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
