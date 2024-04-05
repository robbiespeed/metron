import { isAtom } from '@metron/core/atom.js';
import type { Context, Register } from '../context.js';
import {
  NODE_TYPE_INTRINSIC,
  isJSXNode,
  type Component,
  type JSXIntrinsicNode,
  type JSXNode,
  type JSXProps,
} from '../node.js';
import {
  SLOT_TYPE,
  keyedSlotAccessor,
  type KeyedSlot,
  type KeyedSlotAccessor,
  type PossibleSlot,
  type Slot,
  type ValueSlot,
} from '../slot.js';
import { assertOverride } from '../utils.js';
import {
  initBlueprintChildValueFromKey,
  initBlueprintChildValueFromValueFn,
  initBlueprintValueFromKey,
  initBlueprintValueFromValueFn,
  syncElementAttribute,
  syncElementAttributeToggle,
  syncElementProp,
} from './element.js';
import { EVENT_KEY_PREFIX } from './events.js';

type NodeInitializer = NodeContextInitializer | ElementRegisterInitializer;

type NodeContextInitializer = (
  node: Node,
  state: Record<string, unknown>,
  context: Context
) => undefined;

type ElementRegisterInitializer = (
  element: Element,
  state: Record<string, unknown>,
  register: Register
) => undefined;

export const TEMPLATE_BLUEPRINTS = Symbol();

export interface TemplateBlueprints {
  element: Element;
  instructData: unknown[];
  instructions: number[];
}

export interface TemplateComponent<TProps extends JSXProps>
  extends Component<TProps, Element> {
  [TEMPLATE_BLUEPRINTS]: TemplateBlueprints;
}

export interface JSXTemplateConstructor<TProps extends JSXProps> {
  (props: KeyedSlotAccessor<TProps>): unknown;
}

export const NS_HTML = 'http://www.w3.org/1999/xhtml';
export const NS_SVG = 'http://www.w3.org/2000/svg';
export const NS_MATH_ML = 'http://www.w3.org/1998/Math/MathML';

// TODO: remove ns param and use jsx:ns prop as override
export function template<TProps extends JSXProps>(
  jsxConstructor: JSXTemplateConstructor<TProps>
): TemplateComponent<TProps> {
  const blueprints = createBlueprints(jsxConstructor, NS_HTML);

  const component = ((state, context) =>
    createElementFromTemplateBlueprints(
      blueprints,
      state,
      context
    )) as TemplateComponent<TProps>;
  component[TEMPLATE_BLUEPRINTS] = blueprints;

  return component;
}

// Instructions
const INST_RUN_CONTEXT = 0;
const INST_RUN_REGISTER = 1;
const INST_DOWN = 2;
const INST_UP = 3;
const INST_NEXT_SIBLING = 4;

export function createElementFromTemplateBlueprints(
  blueprints: TemplateBlueprints,
  initState: {},
  context: Context
): Element {
  const element = blueprints.element.cloneNode(true) as Element;
  initElementFromTemplateBlueprints(element, blueprints, initState, context);
  return element;
}

export function initElementFromTemplateBlueprints(
  element: Element,
  blueprints: TemplateBlueprints,
  initState: {},
  context: Context
): undefined {
  const { instructData: initializers, instructions } = blueprints;
  const { register } = context;
  const instEnd = instructions.length;
  let node: Node = element;
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
      case INST_RUN_REGISTER:
        (initializers[x++] as ElementRegisterInitializer)(
          node as Element,
          initState,
          register
        );
        break;
      case INST_RUN_CONTEXT:
        (initializers[x++] as NodeContextInitializer)(node, initState, context);
        break;
    }
  }
}

function createBlueprints(
  jsxConstructor: JSXTemplateConstructor<any>,
  namespace: string
): TemplateBlueprints {
  const root = jsxConstructor(keyedSlotAccessor);
  // TODO if template component node loop through jsxConstructors until intrinsic root is found
  if (
    root == null ||
    !isJSXNode(root) ||
    root.nodeType !== NODE_TYPE_INTRINSIC
  ) {
    throw TypeError('Template root must be a intrinsic node');
  }
  const instructData: NodeInitializer[] = [];
  const instructions: number[] = [];
  const element = buildIntrinsic(root, namespace, instructData, instructions);

  // Trim tail walk instructions
  let i = instructions.length;
  let inst;
  while (i >= 0) {
    inst = instructions[--i]!;
    if (inst <= INST_RUN_REGISTER) {
      instructions.length = i + 1;
      break;
    }
  }

  return { element, instructData, instructions };
}

function buildNode(
  vNode: JSXNode,
  namespace: string,
  instructData: unknown[],
  instructions: number[]
): ChildNode {
  if (vNode.nodeType === NODE_TYPE_INTRINSIC) {
    return buildIntrinsic(vNode, namespace, instructData, instructions);
  }
  throw new TypeError('Expected intrinsic node');
  // TODO: dev mode warn of ignored unknown nodeType
}

type KeyedSlotNodeInitializer = (
  key: string,
  element: Element,
  state: Record<string, unknown>,
  context: Context
) => undefined;

type ValueSlotNodeInitializer = (
  valueFn: (state: any) => any,
  element: Element,
  state: Record<string, unknown>,
  context: Context
) => undefined;

function nodeSlotToInitializer(
  slot: {},
  keyedInit: KeyedSlotNodeInitializer,
  valueFnInit: ValueSlotNodeInitializer
): NodeContextInitializer | undefined {
  const type = (slot as Slot<any>)[SLOT_TYPE];
  if (type !== undefined) {
    if (type === 0) {
      return keyedInit.bind(undefined, (slot as KeyedSlot<any>).key) as any;
    } else if (type === 1) {
      return valueFnInit.bind(
        undefined,
        (slot as ValueSlot<any>).valueFn
      ) as any;
    }
  }
}

function initElementProps(
  instructions: number[],
  keys: string[],
  data: unknown[],
  element: Element,
  state: Record<string, unknown>,
  register: Register
) {
  const end = instructions.length;
  for (let i = 0; i < end; i++) {
    const instruction = instructions[i]!;
    const value =
      (instruction & 0b10) === 0b10
        ? data[i]
        : (instruction & 0b01) === 0b01
        ? (data[i] as any)(state)
        : state[data[i] as string];

    if (value == null) {
      return;
    }

    switch (instruction >> 2) {
      // Setup
      case 0:
        value(element, register);
        break;
      // Prop
      case 1:
        if (isAtom(value)) {
          register(syncElementProp(element, keys[i]!, value));
        } else {
          // Expect the user knows what they are doing
          (element as any)[keys[i]!] = value;
        }
        break;
      // Attribute
      case 2:
        if (isAtom(value)) {
          register(syncElementAttribute(element, keys[i]!, value));
        } else {
          // setAttribute casts to string
          element.setAttribute(keys[i]!, value as any);
        }
        break;
      // Attribute Toggle
      case 3:
        if (isAtom(value)) {
          register(syncElementAttributeToggle(element, keys[i]!, value));
        } else if (value === true || value) {
          element.toggleAttribute(keys[i]!, true);
        }
        break;
      default:
        throw new Error('Unknown Prop Instruction');
    }
  }
}

const jsxNSKey = 'jsx:ns';

function buildIntrinsic(
  vNode: JSXIntrinsicNode,
  namespace: string,
  instructData: unknown[],
  instructions: number[]
): Element {
  const { children, ...props } = vNode.props as Record<string, unknown>;

  if (jsxNSKey in props) {
    namespace = props[jsxNSKey] as string;
  }

  const element = document.createElementNS(namespace, vNode.tag);

  const propInstructions: number[] = [];
  const propKeys: string[] = [];
  const propData: unknown[] = [];

  for (const [key, value] of Object.entries(props)) {
    if (value == null) {
      continue;
    }
    assertOverride<PossibleSlot>(value);

    let [keySpecifier, keyName] = key.split(':', 2) as [string, string];
    if (keySpecifier === key) {
      if (keySpecifier === 'class' && typeof value !== 'string') {
        keyName = 'className';
        keySpecifier = 'prop';
      } else {
        keyName = keySpecifier;
        keySpecifier = 'attr';
      }
    }

    switch (keySpecifier) {
      case 'setup': {
        const slotType = value[SLOT_TYPE];
        if (slotType !== undefined) {
          propInstructions.push(slotType);
          if (slotType === 0) {
            propData.push(value.key);
          } else if (slotType === 1) {
            propData.push(value.valueFn);
          }
        } else {
          propInstructions.push(0b10);
          propData.push(value);
        }
        propKeys.push(keyName);
        continue;
      }
      // @ts-expect-error
      case 'on':
        keyName = `${EVENT_KEY_PREFIX}:${keyName}`;
      case 'prop': {
        const slotType = value[SLOT_TYPE];
        if (slotType !== undefined) {
          propInstructions.push((1 << 2) | slotType);
          if (slotType === 0) {
            propData.push(value.key);
          } else if (slotType === 1) {
            propData.push(value.valueFn);
          }
        } else {
          propInstructions.push((1 << 2) | 0b10);
          propData.push(value);
        }
        propKeys.push(keyName);
        continue;
      }
      case 'attr': {
        const slotType = value[SLOT_TYPE];
        if (slotType !== undefined) {
          propInstructions.push((2 << 2) | slotType);
          if (slotType === 0) {
            propData.push(value.key);
          } else if (slotType === 1) {
            propData.push(value.valueFn);
          }
        } else if (isAtom(value)) {
          propInstructions.push((2 << 2) | 0b10);
          propData.push(value);
        } else {
          element.setAttribute(keyName, value as any);
          continue;
        }
        propKeys.push(keyName);
        continue;
      }
      case 'toggle': {
        const slotType = value[SLOT_TYPE];
        if (slotType !== undefined) {
          propInstructions.push((3 << 2) | slotType);
          if (slotType === 0) {
            propData.push((value as KeyedSlot<any>).key);
          } else if (slotType === 1) {
            propData.push((value as ValueSlot<any>).valueFn);
          }
        } else if (isAtom(value)) {
          propInstructions.push((3 << 2) | 0b10);
          propData.push(value);
        } else if ((value as {}) === true || value) {
          element.toggleAttribute(keyName, true);
          continue;
        }
        propKeys.push(keyName);
        continue;
      }
      default:
        throw new TypeError(`Unsupported specifier "${keySpecifier}"`);
    }
  }

  if (propInstructions.length > 0) {
    instructions.push(INST_RUN_REGISTER);
    instructData.push(
      initElementProps.bind(undefined, propInstructions, propKeys, propData)
    );
  }

  if (Array.isArray(children)) {
    const flatChildren = children.flat();
    const childCount = flatChildren.length;

    instructions.push(INST_DOWN);
    const start = instructions.length;
    let elCount = 0;
    for (let i = 0; i < childCount; i++) {
      const child: unknown = flatChildren[i];
      if (child == null) {
        continue;
      }
      const slotInitializer = nodeSlotToInitializer(
        child,
        initBlueprintChildValueFromKey,
        initBlueprintChildValueFromValueFn
      );
      if (slotInitializer !== undefined) {
        instructions.push(INST_RUN_CONTEXT);
        instructData.push(slotInitializer);
        element.appendChild(document.createTextNode(''));
      } else if (isJSXNode(child)) {
        const childElement = buildNode(
          child,
          namespace,
          instructData,
          instructions
        );
        element.appendChild(childElement);
      } else if (typeof child === 'string') {
        element.appendChild(document.createTextNode(child as string));
      } else {
        throw new Error(
          'TODO handle scoped Atom, and array?, throw for others?'
        );
      }
      elCount++;
      instructions.push(INST_NEXT_SIBLING);
    }
    if (instructions.length === start + elCount) {
      // Remove branch instructions
      instructions.length = start - 1;
    } else {
      // Remove last INST_NEXT_SIBLING
      instructions.length--;

      instructions.push(INST_UP);
    }
  } else if (children != null) {
    const slotInitializer = nodeSlotToInitializer(
      children,
      initBlueprintValueFromKey,
      initBlueprintValueFromValueFn
    );
    if (slotInitializer !== undefined) {
      instructions.push(INST_RUN_CONTEXT);
      instructData.push(slotInitializer);
    } else if (isJSXNode(children)) {
      instructions.push(INST_DOWN);
      const start = instructions.length;
      const childElement = buildNode(
        children,
        namespace,
        instructData,
        instructions
      );
      element.appendChild(childElement);
      if (instructions.length === start) {
        instructions.length--;
      } else {
        instructions.push(INST_UP);
      }
    } else if (typeof children === 'string') {
      element.textContent = children;
    } else {
      throw new Error('TODO handle scoped Atom, throw for others?');
    }
  }

  return element;
}
