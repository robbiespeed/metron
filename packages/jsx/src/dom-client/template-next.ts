import { isAtom, runAndSubscribe, subscribe } from '@metron/core/atom.js';
import type { JSXContext } from '../context.js';
import {
  NODE_TYPE_INTRINSIC,
  type JSXNode,
  type Register,
  isJSXNode,
  type JSXProps,
  type Component,
} from '../node.js';
import { assertOverride } from '../utils.js';
import {
  EVENT_KEY_PREFIX,
  type DelegatedEventParams,
  type DelegatedEventTarget,
  EVENT_DATA_KEY_PREFIX,
  runtimeEventListener,
} from './events.js';
import { nAppendChild, nCloneNode } from './dom-methods.js';

interface DynamicTemplateCreator<TProps extends JSXProps> {
  (props: PropAccessor<TProps>): JSXNode;
}

export type TemplateComponent<TProps extends JSXProps = JSXProps> = Component<
  TProps,
  Element
>;

const NS_HTML = 'http://www.w3.org/1999/xhtml';
const NS_SVG = 'http://www.w3.org/2000/svg';
const NS_MATH_ML = 'http://www.w3.org/1998/Math/MathML';

export function template<TProps extends JSXProps>(
  createTemplate: DynamicTemplateCreator<TProps>,
  ns: typeof NS_HTML | typeof NS_SVG | typeof NS_MATH_ML = NS_HTML
): TemplateComponent<TProps> {
  const [templateElement, nodeInitializers, initInstructions] =
    createTemplateFromJSX(createTemplate(propProxy), ns);

  return initInstructions.length === 0
    ? (nCloneNode.bind(templateElement, true) as () => Element)
    : bindableCreateElementFromTemplate.bind(
        undefined,
        templateElement,
        nodeInitializers,
        initInstructions
      );
}

type NodeInitializer = (
  node: Node,
  initState: Record<string, unknown>,
  context: JSXContext,
  register: Register
) => undefined;

// Base Instructions
const INST_DOWN = 36;
const INST_UP = 35;
const INST_NEXT_SIBLING = 34;
const INST_RUN = 33;
const INST_RUN_N = 32;
const INST_MAX_N = 31; // All numbers 0-31 are reserved for N values

// TODO: Optimized Instructions
// Instead of SET_HISTORY, INST_USE_HISTORY maybe INIT_HISTORY, ADD_HISTORY, HISTORY_I
// init an array of nodes to use for lookup
// INST_RUN_NO_X don't increment x
// INST_RUN_N_NO_X don't increment x
// const INST_DOWN_N = 5;
// const INST_UP_N = 6;
// const INST_NEXT_SIBLING_N = 7;
// const INST_ROOT = 8;
// const INST_SET_HISTORY = 9;
// const INST_USE_HISTORY = 10;
// const INST_SET_X = 11;

function bindableCreateElementFromTemplate(
  template: Element,
  initializers: NodeInitializer[],
  instructions: number[],
  initState: Record<string, unknown>,
  context: JSXContext,
  register: Register
): Element {
  const root = nCloneNode.call(template, true) as Element;
  const instEnd = instructions.length;
  let node: Node = root;
  let x = 0;

  for (let i = 0; i < instEnd; i++) {
    switch (instructions[i]!) {
      case INST_NEXT_SIBLING:
        node = node.nextSibling!;
        break;
      case INST_DOWN:
        node = node.firstChild!;
        break;
      case INST_UP:
        node = node.parentNode!;
        break;
      case INST_RUN:
        initializers[x++]!(node, initState, context, register);
        break;
      case INST_RUN_N:
        const last = x + instructions[++i]!;
        for (x; x <= last; x++) {
          initializers[x]!(node, initState, context, register);
        }
        break;
    }
  }
  return root;
}

type PropAccessor<TProps extends JSXProps> = {
  [K in keyof TProps]: Slot & TProps[K];
};

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

function createTemplateFromJSX(
  root: JSXNode,
  namespace: string
): [
  templateElement: Element,
  nodeInitializers: NodeInitializer[],
  initInstructions: number[]
] {
  const nodeInitializers: NodeInitializer[] = [];
  const initInstructions: number[] = [];
  const element = buildTemplate(
    root,
    namespace,
    nodeInitializers,
    initInstructions
  );

  // Trim tail movement instructions
  let i = initInstructions.length - 1;
  let inst;
  while (i >= 0) {
    inst = initInstructions[--i];
    if (inst === INST_RUN) {
      initInstructions.length = i + 1;
      break;
    } else if (inst === INST_RUN_N) {
      initInstructions.length = i + 2;
      break;
    }
  }

  return [element, nodeInitializers, initInstructions];
}

// function countInst(
//   instructions: number[],
//   i: number,
//   end: number,
//   inst: number
// ): number {
//   let count = 0;
//   for (; i < end; i++) {
//     if (instructions[i] !== inst) {
//       break;
//     }
//     count++;
//   }
//   return count;
// }

// function countRuns(
//   instructions: number[],
//   i: number,
//   end: number
// ): [number, number] {
//   let count = 0;
//   loop: for (; i < end; i++) {
//     switch (instructions[i]) {
//       case INST_RUN:
//         count++;
//         break;
//       case INST_RUN_N:
//         count += instructions[++i]!;
//         break;
//       default:
//         break loop;
//     }
//   }
//   return [i, count];
// }

// TODO:
// function toOptimizedInstructions(instructions: number[]): number[] {
//   const optimized: number[] = [];
//   const end = instructions.length;

//   let i = 0;
//   while (i < end) {
//     const [runs, j] = countRuns(instructions, i, end);
//     i = j;
//     let down = countInst(instructions, i, end, INST_DOWN);
//     i += down;
//     const next = countInst(instructions, i, end, INST_NEXT_SIBLING);
//     i += next;
//     let up = countInst(instructions, i, end, INST_UP);
//     i += up;

//     if (up > 0) {
//     }
//   }

//   // let trimCount = 0;
//   // for (let i = instructions.length - 1; i >= downTo; i--) {
//   //   if (instructions[i]! >= INST_RUN) {
//   //     break;
//   //   }
//   //   trimCount++;
//   // }
//   // instructions.length = instructions.length - trimCount;

//   return optimized;
// }

function buildTemplate(
  vNode: JSXNode,
  namespace: string,
  nodeInitializers: NodeInitializer[],
  initInstructions: number[]
): Element {
  if (vNode.nodeType !== NODE_TYPE_INTRINSIC) {
    throw new Error('TODO');
  }

  const element = document.createElementNS(namespace, vNode.tag);

  const { children, ...props } = vNode.props as Record<string, unknown>;

  let elementInitCount = 0;

  for (const [key, value] of Object.entries(props)) {
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
          throw new Error('TODO');
          // continue;
        }
        throw new TypeError(
          'Templates may only use slots to register setup functions'
        );
      case 'prop':
        if (isSlot(value)) {
          elementInitCount++;
          nodeInitializers.push(
            initPropFromState.bind(undefined, keyName, getSlotKey(value)) as any
          );
          continue;
        }
        throw new TypeError('Templates may only use slots to register props');
      case 'attr':
        if (isSlot(value)) {
          elementInitCount++;
          nodeInitializers.push(
            initAttributeFromState.bind(
              undefined,
              keyName,
              getSlotKey(value)
            ) as any
          );
        } else if (value === true) {
          element.toggleAttribute(keyName, true);
        } else {
          // setAttribute casts to string
          element.setAttribute(keyName, value as any);
        }
        continue;
      case 'on':
        // throw new Error('TODO');
        if (isSlot(value)) {
          elementInitCount++;
          nodeInitializers.push(
            initEventFromState.bind(
              undefined,
              keyName,
              getSlotKey(value)
            ) as any
          );
          continue;
        }
        throw new TypeError(
          'Templates may only use slots to register event handlers'
        );
      case 'delegate':
        if (isSlot(value)) {
          elementInitCount++;
          nodeInitializers.push(
            initDelegatedEventFromState.bind(
              undefined,
              keyName,
              getSlotKey(value)
            ) as any
          );
          continue;
        }
        throw new TypeError(
          'Templates may only use slots to register data event handlers'
        );
      default:
        throw new TypeError(`Unsupported specifier "${keySpecifier}"`);
    }
  }

  if (elementInitCount === 1) {
    initInstructions.push(INST_RUN);
  } else if (elementInitCount > 0) {
    // N of 0 means run once, so normalize the n value to be 0 based
    elementInitCount--;
    while (elementInitCount > INST_MAX_N) {
      initInstructions.push(INST_RUN_N, INST_MAX_N);
      elementInitCount -= INST_MAX_N;
    }
    initInstructions.push(INST_RUN_N, elementInitCount);
  }

  const childCount = Array.isArray(children) ? children.length : 0;

  if (childCount !== 0) {
    assertOverride<unknown[]>(children);
    initInstructions.push(INST_DOWN);
    const start = initInstructions.length;
    let elCount = 0;
    for (let i = 0; i < childCount; i++) {
      const child: unknown = children[i];
      if (child == null) {
        continue;
      }
      if (isSlot(child)) {
        initInstructions.push(INST_RUN);
        nodeInitializers.push(
          initPlaceholderFromState.bind(undefined, getSlotKey(child)) as any
        );
        nAppendChild.call(element, document.createTextNode(''));
      } else if (isJSXNode(child)) {
        if (child.nodeType === NODE_TYPE_INTRINSIC) {
          const childElement = buildTemplate(
            child,
            namespace,
            nodeInitializers,
            initInstructions
          );
          nAppendChild.call(element, childElement);
        } else {
          throw new Error('TODO');
        }
      } else if (typeof child === 'string') {
        nAppendChild.call(element, document.createTextNode(child as string));
      } else {
        throw new Error('TODO');
      }
      elCount++;
      initInstructions.push(INST_NEXT_SIBLING);
    }
    if (initInstructions.length === start + elCount) {
      // Remove branch instructions
      initInstructions.length = start - 1;
    } else {
      // Remove last INST_NEXT_SIBLING
      initInstructions.length--;

      initInstructions.push(INST_UP);
    }
  } else if (children != undefined) {
    if (isSlot(children)) {
      initInstructions.push(INST_DOWN, INST_RUN, INST_UP);
      nodeInitializers.push(
        initPlaceholderFromState.bind(undefined, getSlotKey(children)) as any
      );
      nAppendChild.call(element, document.createTextNode(''));
    } else if (isJSXNode(children)) {
      initInstructions.push(INST_DOWN);
      const start = initInstructions.length;
      if (children.nodeType === NODE_TYPE_INTRINSIC) {
        const childElement = buildTemplate(
          children,
          namespace,
          nodeInitializers,
          initInstructions
        );
        nAppendChild.call(element, childElement);
      } else {
        throw new Error('TODO');
      }
      if (initInstructions.length === start) {
        initInstructions.length--;
      } else {
        initInstructions.push(INST_UP);
      }
    } else if (typeof children === 'string') {
      element.textContent = children;
    }
  }

  return element;
}

function initAttributeFromState(
  name: string,
  stateKey: string,
  element: Element,
  initState: Record<string, unknown>,
  context: JSXContext,
  register: Register
): undefined {
  const initValue = initState[stateKey];

  if (initValue == null || initValue === false) {
    return;
  }

  if (initValue === true) {
    element.toggleAttribute(name, true);
  } else if (isAtom(initValue)) {
    const firstValue = initValue.unwrap();

    if (firstValue === true) {
      element.toggleAttribute(name, true);
    } else if (firstValue !== undefined && firstValue !== false) {
      // setAttribute casts to string
      element.setAttribute(name, firstValue as any);
    }

    register(
      subscribe(initValue, () => {
        const value = initValue.unwrap();
        switch (typeof value) {
          case 'boolean':
            element.toggleAttribute(name, value);
            break;
          case 'undefined':
            element.removeAttribute(name);
            break;
          default:
            // setAttribute casts to string
            element.setAttribute(name, value as any);
            break;
        }
      })
    );
  } else {
    // setAttribute casts to string
    element.setAttribute(name, initValue as any);
  }
}

function initPropFromState(
  name: string,
  stateKey: string,
  element: Element,
  initState: Record<string, unknown>,
  context: JSXContext,
  register: Register
): undefined {
  const initValue = initState[stateKey];

  if (initValue == null) {
    return;
  }

  if (isAtom(initValue)) {
    register(
      runAndSubscribe(initValue, () => {
        // Expect the user knows what they are doing
        (element as any)[name] = initValue.unwrap();
      })
    );
  } else {
    // Expect the user knows what they are doing
    (element as any)[name] = initValue;
  }
}

function initDelegatedEventFromState(
  name: string,
  stateKey: string,
  element: Element,
  initState: Record<string, unknown>
): undefined {
  const value = initState[stateKey];

  if (value == null) {
    return;
  }

  // TODO: Dev mode only, check if key is in delegatedEventTypes and warn if not

  assertOverride<DelegatedEventParams<unknown, EventTarget>>(value);
  assertOverride<DelegatedEventTarget>(element);

  element[`${EVENT_KEY_PREFIX}:${name}`] = value.handler;
  element[`${EVENT_DATA_KEY_PREFIX}:${name}`] = value.data;
}

function initEventFromState(
  name: string,
  stateKey: string,
  element: Element,
  initState: Record<string, unknown>
): undefined {
  const value = initState[stateKey];

  if (value == null) {
    return;
  }

  // TODO: Dev mode only, check if key is in delegatedEventTypes and warn if not

  assertOverride<EventListener>(value);
  element.addEventListener(name, runtimeEventListener.bind(value), {
    passive: true,
  });
}

function initPlaceholderFromState(
  stateKey: string,
  placeHolder: Text,
  initState: Record<string, unknown>,
  context: JSXContext,
  register: Register
) {
  const initValue = initState[stateKey];
  if (initValue == null) {
    return;
  }

  if (typeof initValue === 'object') {
    if (isAtom(initValue)) {
      register(
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
      return;
    }
    // TODO DOM node
  }

  // Data casts to string
  placeHolder.data = initValue as string;
}

/*
TODO:
Should 
A. accumulate then run against bindings?
Or
B. walk and run bindings together?
INST_RUN_X runs instruction X on the current node

B Seems better
*/
