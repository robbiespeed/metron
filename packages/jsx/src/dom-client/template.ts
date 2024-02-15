import { isAtom } from '@metron/core/atom.js';
import type { JSXContext } from '../context.js';
import {
  NODE_TYPE_INTRINSIC,
  type JSXNode,
  type Register,
  isJSXNode,
  type JSXProps,
  type Component,
  type JSXIntrinsicNode,
} from '../node.js';
import { assertOverride } from '../utils.js';
import {
  initAttributeFromState,
  initSyncAttributeToggle as initSyncAttributeToggle,
  initAttributeToggleFromState,
  initEventFromState,
  initPlaceholderFromState,
  initProp,
  initPropFromState,
  initSetupFromState,
  initSyncAttribute,
  initSetup,
  initEvent,
} from './element.js';

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
    ? () => templateElement.cloneNode(true) as Element
    : (state, context, register) =>
        createElementFromTemplate(
          templateElement,
          nodeInitializers,
          initInstructions,
          state,
          context,
          register
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

function createElementFromTemplate(
  template: Element,
  initializers: NodeInitializer[],
  instructions: number[],
  initState: Record<string, unknown>,
  context: JSXContext,
  register: Register
): Element {
  const root = template.cloneNode(true) as Element;
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
  if (root.nodeType !== NODE_TYPE_INTRINSIC) {
    throw TypeError('Template root must be a intrinsic node');
  }
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

function buildTemplate(
  vNode: JSXIntrinsicNode,
  namespace: string,
  nodeInitializers: NodeInitializer[],
  initInstructions: number[]
): Element {
  const element = document.createElementNS(namespace, vNode.tag);

  const { children, ...props } = vNode.props as Record<string, unknown>;

  let elementInitCount = 0;

  for (const [key, value] of Object.entries(props)) {
    let [keySpecifier, keyName] = key.split(':', 2) as [string, string];
    if (keySpecifier === key) {
      keyName = keySpecifier;
      keySpecifier = 'attr';
    }
    switch (keySpecifier) {
      case 'setup':
        if (value == null) {
          continue;
        }
        elementInitCount++;
        if (isSlot(value)) {
          nodeInitializers.push(
            initSetupFromState.bind(undefined, getSlotKey(value)) as any
          );
          continue;
        }
        nodeInitializers.push(initSetup.bind(undefined, value as any) as any);
        continue;
      case 'prop':
        elementInitCount++;
        if (value != null && isSlot(value)) {
          nodeInitializers.push(
            initPropFromState.bind(undefined, keyName, getSlotKey(value)) as any
          );
          continue;
        }
        nodeInitializers.push(initProp.bind(undefined, keyName, value) as any);
        continue;
      case 'attr':
        if (value == null) {
          continue;
        }
        if (isSlot(value)) {
          elementInitCount++;
          if (key === 'class') {
            nodeInitializers.push(
              initPropFromState.bind(
                undefined,
                'className',
                getSlotKey(value)
              ) as any
            );
            continue;
          }
          nodeInitializers.push(
            initAttributeFromState.bind(
              undefined,
              keyName,
              getSlotKey(value)
            ) as any
          );
        } else if (isAtom(value)) {
          elementInitCount++;
          nodeInitializers.push(
            initSyncAttribute.bind(undefined, keyName, value) as any
          );
        } else {
          // setAttribute casts to string
          element.setAttribute(keyName, value as any);
        }
        continue;
      case 'toggle':
        if (value == null) {
          continue;
        }
        if (isSlot(value)) {
          elementInitCount++;
          nodeInitializers.push(
            initAttributeToggleFromState.bind(
              undefined,
              keyName,
              getSlotKey(value)
            ) as any
          );
        } else if (isAtom(value)) {
          elementInitCount++;
          nodeInitializers.push(
            initSyncAttributeToggle.bind(undefined, keyName, value) as any
          );
        } else if (value === true || value) {
          element.toggleAttribute(keyName, true);
        }
        continue;
      case 'on':
        if (value == null) {
          continue;
        }
        elementInitCount++;
        if (isSlot(value)) {
          nodeInitializers.push(
            initEventFromState.bind(
              undefined,
              keyName,
              getSlotKey(value)
            ) as any
          );
          continue;
        }
        nodeInitializers.push(
          initEvent.bind(undefined, keyName, value as any) as any
        );
        continue;
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
        element.appendChild(document.createTextNode(''));
      } else if (isJSXNode(child)) {
        if (child.nodeType === NODE_TYPE_INTRINSIC) {
          const childElement = buildTemplate(
            child,
            namespace,
            nodeInitializers,
            initInstructions
          );
          element.appendChild(childElement);
        } else {
          throw new Error('TODO');
        }
      } else if (typeof child === 'string') {
        element.appendChild(document.createTextNode(child as string));
      } else {
        throw new Error('TODO array?');
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
  } else if (children != null) {
    if (isSlot(children)) {
      initInstructions.push(INST_DOWN, INST_RUN, INST_UP);
      nodeInitializers.push(
        initPlaceholderFromState.bind(undefined, getSlotKey(children)) as any
      );
      element.appendChild(document.createTextNode(''));
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
        element.appendChild(childElement);
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

/*
TODO:
Should 
A. accumulate then run against bindings?
Or
B. walk and run bindings together?
INST_RUN_X runs instruction X on the current node

B Seems better
*/
