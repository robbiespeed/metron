import { isAtom } from '@metron/core/atom.js';
import type { Context } from '../context.js';
import {
  insertValue,
  syncElementAttribute,
  syncElementAttributeToggle,
  syncElementProp,
} from './element.js';
import {
  NODE_TYPE_INTRINSIC,
  isJSXNode,
  type Component,
  type JSXIntrinsicNode,
  type JSXProps,
} from '../node.js';
import { EVENT_KEY_PREFIX } from './events.js';

/*
# Element Instructions
## Traversal
0: FirstChild
1: Parent
2: NextSibling

## Init (bitmask: 4 empty bits, 12 bits for value/param index, 12 bits for key index, 4 bits for instruction)
4,5: Render Child (Value, Param)
6,7: Render at Marker (Value, Param)
8,9: Setup (Value, Param)
10,11: Prop (Value, Param)
12,13: Attribute (Value, Param)
14,15: Toggle (Value, Param)
*/

function initElement(
  element: Element,
  context: Context,
  params: unknown[],
  values: unknown[],
  strings: string[],
  instructions: number[]
): undefined {
  const { register } = context;
  const end = instructions.length;
  let node: Node = element;

  for (let i = 0; i < end; i++) {
    const inst = instructions[i]!;
    if (inst === 0) {
      node = node.firstChild!;
    } else if (inst === 1) {
      node = node.parentNode!;
    } else if (inst === 2) {
      node = node.nextSibling!;
    } else {
      const value: any =
        (inst & 0b1) === 0b1 ? params[inst >> 16] : values[inst >> 16];

      if (value == null) {
        continue;
      }

      switch (inst & 0b1110) {
        // Render Child
        case 4: {
          insertValue(value, context, node as Element, null);
          break;
        }
        // Render at Marker
        case 6: {
          insertValue(value, context, node.parentNode!, node);
          break;
        }
        // Setup
        case 8: {
          value(node, context);
          break;
        }
        // Prop
        case 10: {
          if (isAtom(value)) {
            register(
              syncElementProp(
                node as Element,
                strings[(inst >> 4) & 0xfff]!,
                value
              )
            );
          } else {
            (node as any)[strings[(inst >> 4) & 0xfff]!] = value;
          }
          break;
        }
        // Attribute
        case 12: {
          if (isAtom(value)) {
            register(
              syncElementAttribute(
                node as Element,
                strings[(inst >> 4) & 0xfff]!,
                value
              )
            );
          } else {
            // setAttribute casts to string
            (node as Element).setAttribute(
              strings[(inst >> 4) & 0xfff]!,
              value as any
            );
          }
          break;
        }
        // Attribute Toggle
        case 14: {
          if (isAtom(value)) {
            register(
              syncElementAttributeToggle(
                node as Element,
                strings[(inst >> 4) & 0xfff]!,
                value
              )
            );
          } else {
            // setAttribute casts to string
            (node as Element).toggleAttribute(
              strings[(inst >> 4) & 0xfff]!,
              !!value
            );
          }
          break;
        }
      }
    }
  }
}

function createParams(
  state: any,
  context: Context,
  fns: any[],
  keys: string[],
  instructions: number[]
): unknown[] {
  const end = instructions.length;
  const params: any[] = new Array(end);

  for (let i = 0; i < end; i++) {
    const inst = instructions[i]!;
    switch (inst & 0b11) {
      // State Key
      case 0: {
        params[i] = state[keys[inst >> 2]!];
        break;
      }
      // Param Key
      case 1: {
        params[i] = params[inst >> 14]?.[keys[(inst >> 2) & 0xfff]!];
        break;
      }
      // State Fn
      case 2: {
        params[i] = fns[inst >> 2]!(state, context);
        break;
      }
      // Param Fn
      case 3: {
        params[i] = fns[(inst >> 2) & 0xfff]!(params[inst >> 14], context);
        break;
      }
    }
  }

  return params;
}

// TODO: For fn slots to be more useful they should be formed in a graph rather than a tree like key slots.
// This way functions could have many slots as params.

class _Slot {
  #keySlots?: Map<string, Slot<unknown>>;
  #position: number;
  #instructions: number[];
  #getStringPosition: (s: string) => number;

  constructor(
    position: number,
    instructions: number[],
    getStringPosition: (s: string) => number
  ) {
    this.#position = position;
    this.#instructions = instructions;
    this.#getStringPosition = getStringPosition;
  }

  static getFromKey(parent: _Slot, key: string): Slot<unknown> {
    const existingSlot = (parent.#keySlots ??= new Map()).get(key);
    if (existingSlot !== undefined) {
      return existingSlot as any;
    }

    const keyPosition = parent.#getStringPosition(key);
    const parentPosition = parent.#position;

    const position = parent.#instructions.length;

    parent.#instructions.push(
      parentPosition === -1
        ? keyPosition << 2
        : (keyPosition << 2) | 2 | (parentPosition << 14)
    );

    const slot = new _Slot(
      position,
      parent.#instructions,
      parent.#getStringPosition
    );

    parent.#keySlots.set(key, slot as any);

    return slot as any;
  }

  static getPosition(value: {}): number {
    if (typeof value === 'object' && #position in value) {
      return value.#position;
    }
    return -1;
  }
}

const { getFromKey, getPosition: getSlotPosition } = _Slot;

const invalidOp = () => {
  throw new Error('Invalid operation on slot');
};
Object.setPrototypeOf(
  _Slot.prototype,
  new Proxy({} as any, {
    get(target, key: string, receiver) {
      return getFromKey(receiver, key);
    },
    apply: invalidOp,
    construct: invalidOp,
    defineProperty: invalidOp,
    deleteProperty: invalidOp,
    getOwnPropertyDescriptor: invalidOp,
    getPrototypeOf: invalidOp,
    has: invalidOp,
    isExtensible: invalidOp,
    ownKeys: invalidOp,
    preventExtensions: invalidOp,
    set: invalidOp,
    setPrototypeOf: invalidOp,
  })
);

type SlotParent<TValue> = {
  [K in keyof TValue]: K extends string ? Slot<TValue[K]> : never;
};

declare const TYPE: unique symbol;
type SlotNode<TValue> = { [TYPE]: TValue };

type AllObjectKeys<T> = string &
  keyof { [V in T extends object ? T : {} as keyof V]: void };
type Combined<TKeys extends string, TValue> = {
  [K in TKeys]: TValue extends Record<K, any> ? TValue[K] : undefined;
};

type Slot<TValue> = _Slot &
  SlotNode<TValue> &
  SlotParent<Combined<AllObjectKeys<TValue>, TValue>>;

// TODO: this is the type to use on Element props
export type SlotLeaf<TValue> = _Slot & SlotNode<TValue>;

const jsxNSKey = 'jsx:ns';

function buildIntrinsic(
  vNode: JSXIntrinsicNode,
  namespace: string,
  getStringPosition: (s: string) => number,
  getValuePosition: (v: unknown) => number,
  instructions: number[]
): Element {
  const { children, ...props } = vNode.props as Record<string, unknown>;

  if (jsxNSKey in props) {
    namespace = props[jsxNSKey] as string;
  }

  const element = document.createElementNS(namespace, vNode.tag);

  for (const [key, value] of Object.entries(props)) {
    if (value == null) {
      continue;
    }

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

    const slotPosition = getSlotPosition(value);
    switch (keySpecifier) {
      case 'setup': {
        if (slotPosition === -1) {
          instructions.push(8 | (getValuePosition(value) << 16));
        } else {
          instructions.push(9 | (slotPosition << 16));
        }
        continue;
      }
      // @ts-expect-error: fall through expected
      case 'on':
        keyName = `${EVENT_KEY_PREFIX}:${keyName}`;
      case 'prop': {
        if (slotPosition === -1) {
          instructions.push(
            10 |
              (getStringPosition(keyName) << 4) |
              (getValuePosition(value) << 16)
          );
        } else {
          instructions.push(
            11 | (getStringPosition(keyName) << 4) | (slotPosition << 16)
          );
        }
        continue;
      }
      case 'attr': {
        if (slotPosition >= 0) {
          instructions.push(
            13 | (getStringPosition(keyName) << 4) | (slotPosition << 16)
          );
        } else if (isAtom(value)) {
          instructions.push(
            12 |
              (getStringPosition(keyName) << 4) |
              (getValuePosition(value) << 16)
          );
        } else {
          element.setAttribute(keyName, value as any);
        }
        continue;
      }
      case 'toggle': {
        if (slotPosition >= 0) {
          instructions.push(
            15 | (getStringPosition(keyName) << 4) | (slotPosition << 16)
          );
        } else if (isAtom(value)) {
          instructions.push(
            14 |
              (getStringPosition(keyName) << 4) |
              (getValuePosition(value) << 16)
          );
        } else if (value === true || value) {
          element.toggleAttribute(keyName, true);
        }
        continue;
      }
      default:
        throw new TypeError(`Unsupported specifier "${keySpecifier}"`);
    }
  }

  // TODO multi and single value logic
  if (Array.isArray(children)) {
    const childCount = children.length;

    instructions.push(0);
    const start = instructions.length;
    let elCount = 0;
    for (let i = 0; i < childCount; i++) {
      const child: unknown = children[i];
      if (child == null) {
        continue;
      }
      const slotPosition = getSlotPosition(child);
      if (slotPosition >= 0) {
        instructions.push(7 | (slotPosition << 16));
        element.appendChild(document.createTextNode(''));
      } else if (isJSXNode(child) && child.nodeType === NODE_TYPE_INTRINSIC) {
        element.appendChild(
          buildIntrinsic(
            child,
            namespace,
            getStringPosition,
            getValuePosition,
            instructions
          )
        );
      } else if (typeof child === 'object') {
        if (Array.isArray(child)) {
          throw new TypeError('Nested arrays not permitted inside JSX');
        }
        instructions.push(6 | (getValuePosition(child) << 16));
        element.appendChild(document.createTextNode(''));
      } else {
        element.appendChild(document.createTextNode(String(child)));
      }
      elCount++;
      instructions.push(2);
    }
    if (instructions.length === start + elCount) {
      // Remove branch instructions
      instructions.length = start - 1;
    } else {
      // Remove last INST_NEXT_SIBLING
      instructions.length--;
      instructions.push(1);
    }
  } else if (children != null) {
    const slotPosition = getSlotPosition(children);
    if (slotPosition >= 0) {
      instructions.push(5 | (slotPosition << 16));
      element.appendChild(document.createTextNode(''));
    } else if (
      isJSXNode(children) &&
      children.nodeType === NODE_TYPE_INTRINSIC
    ) {
      instructions.push(0);
      const start = instructions.length;
      element.appendChild(
        buildIntrinsic(
          children,
          namespace,
          getStringPosition,
          getValuePosition,
          instructions
        )
      );
      if (start === instructions.length) {
        instructions.length--;
      } else {
        instructions.push(1);
      }
    } else if (typeof children === 'object') {
      instructions.push(4 | (getValuePosition(children) << 16));
      element.appendChild(document.createTextNode(''));
    } else {
      element.appendChild(document.createTextNode(String(children)));
    }
  }

  return element;
}

export const TEMPLATE_BLUEPRINTS = Symbol();

export interface TemplateBlueprints {
  element: Element;
  instructions: number[];
  paramInstructions: number[];
  strings: string[];
  values: unknown[];
}

export interface TemplateComponent<TProps extends JSXProps>
  extends Component<TProps, Element> {
  [TEMPLATE_BLUEPRINTS]: TemplateBlueprints;
}

export interface JSXTemplateConstructor<TProps extends JSXProps> {
  (props: SlotParent<TProps>): unknown;
}

export const NS_HTML = 'http://www.w3.org/1999/xhtml';
export const NS_SVG = 'http://www.w3.org/2000/svg';
export const NS_MATH_ML = 'http://www.w3.org/1998/Math/MathML';

export function template<TProps extends JSXProps>(
  jsxConstructor: JSXTemplateConstructor<TProps>
): TemplateComponent<TProps> {
  const blueprints = createBlueprints(jsxConstructor, NS_HTML);

  const component = (state: TProps, context: Context) =>
    createElementFromTemplateBlueprints(blueprints, state, context);
  component[TEMPLATE_BLUEPRINTS] = blueprints;

  return component;
}

export function createElementFromTemplateBlueprints(
  blueprints: TemplateBlueprints,
  state: {},
  context: Context
): Element {
  const element = blueprints.element.cloneNode(true) as Element;
  /*
  TODO: Does perf improve if there is a separate fns array.
  Does it worsen if strings is merged entirely with values?
  If separate arrays are more performant should the strings inside values be moved to strings?
  It seems rare that strings would end up in values array though.
  It would require more bits for instructions, but there is room.
  Ex: first 2 bits could indicate if the value is found in values (0b00), params (0b01), fns (0b10), strings (0b11).
  Exact number of bits and what kind of array separations to have should be determined by frequency.
  Most likely types in values would be: jsx node, fn (slot fn or event handler w/o data), atom (global), string (props), number (props)
  Some additional considerations:
  - fn spans uses from both param and element instructions.
  - strings is already it's own array.
  It would make template construction code slightly more complex, but probably by only a few lines.
  Instruction execution code would be a very minor change.
  Params and values always need to be polymorphic.

  Cleanest approach would be to merge strings into values.
  And rename values to staticValues and params to instanceValues.
*/

  const { instructions, paramInstructions, strings, values } = blueprints;
  const params = createParams(
    state,
    context,
    values,
    strings,
    paramInstructions
  );
  initElement(element, context, params, values, strings, instructions);
  return element;
}

function createBlueprints(
  jsxConstructor: JSXTemplateConstructor<any>,
  namespace: string
): TemplateBlueprints {
  const paramInstructions: number[] = [];
  const strings: string[] = [];
  const getStringPosition = getItemPosition.bind(strings, new Map());
  const slotParent = new _Slot(-1, paramInstructions, getStringPosition);
  const root = jsxConstructor(slotParent as any);

  if (
    root == null ||
    !isJSXNode(root) ||
    root.nodeType !== NODE_TYPE_INTRINSIC
  ) {
    throw TypeError('Template root must be a intrinsic node');
  }

  const values: unknown[] = [];
  const getValuePosition = getItemPosition.bind(values, new Map());

  const instructions: number[] = [];
  const element = buildIntrinsic(
    root,
    namespace,
    getStringPosition,
    getValuePosition,
    instructions
  );

  // Trim tail walk instructions
  let i = instructions.length;
  let inst;
  while (i >= 0) {
    inst = instructions[--i]!;
    if (inst > 3) {
      instructions.length = i + 1;
      break;
    }
  }

  return {
    element,
    instructions,
    paramInstructions,
    strings,
    values,
  };
}

function getItemPosition(this: any[], map: Map<any, number>, value: any) {
  let position = map.get(value);
  if (position === undefined) {
    position = this.length;
    this.push(value);
    map.set(value, position);
  }
  return position;
}
