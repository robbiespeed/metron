import type { JSXProps } from './node.js';

export type KeyedSlotAccessor<TProps extends JSXProps> = {
  [K in keyof TProps]: K extends string ? KeyedSlot<TProps[K]> : never;
};

export type SlottableJSXProps<TProps extends JSXProps> = {
  [K in keyof TProps]: K extends string
    ? TProps[K] | Slot<TProps[K]>
    : TProps[K];
};

declare const SLOT_VALUE: unique symbol;

// TODO make slots more general, change name to channel?
// There is a starting value to the component (props)
// You may retrieve a inner value by key or transform by map fn
// This retrieval/transform may be nested

const SLOT_TYPE_KEYED = 0;
const SLOT_TYPE_VALUE = 1;
// TODO slot for retrieving keyed value from value fn slot result
// const SLOT_TYPE_KEYED_VALUE = 2;

export const SLOT_TYPE = Symbol();

export interface Slot<TValue> {
  [SLOT_TYPE]: number;
  [SLOT_VALUE]: TValue;
}

export interface ValueSlot<TValue> {
  [SLOT_TYPE]: typeof SLOT_TYPE_VALUE;
  [SLOT_VALUE]: TValue;
  valueFn: (state: any) => TValue;
}

export interface KeyedSlot<TValue> {
  [SLOT_TYPE]: typeof SLOT_TYPE_KEYED;
  [SLOT_VALUE]: TValue;
  key: string;
}

export type PossibleSlot =
  | ValueSlot<unknown>
  | KeyedSlot<unknown>
  | { [SLOT_TYPE]?: undefined }
  | undefined
  | null;

export function createValueSlot<TState, TValue>(
  valueFn: (state: TState) => TValue
): ValueSlot<TValue> {
  return { [SLOT_TYPE]: SLOT_TYPE_VALUE, valueFn } as ValueSlot<TValue>;
}

const noOpTrap = () => false;
const empty = Object.create(null);

export const keyedSlotAccessor: KeyedSlotAccessor<any> = new Proxy(empty, {
  get(_, key: string) {
    return { [SLOT_TYPE]: SLOT_TYPE_KEYED, key };
  },
  set: noOpTrap,
  has: noOpTrap,
  setPrototypeOf: noOpTrap,
  defineProperty: noOpTrap,
  deleteProperty: noOpTrap,
});

export interface SlotHandler {
  [SLOT_TYPE_KEYED]?: (slot: KeyedSlot<unknown>) => undefined;
  [SLOT_TYPE_VALUE]?: (slot: ValueSlot<unknown>) => undefined;
}

export function handleSlot(value: {}, handler: SlotHandler): boolean {
  const type = (value as Partial<Slot<unknown>>)[SLOT_TYPE];
  if (type !== undefined) {
    const handleFn = handler[type as keyof SlotHandler];
    if (handleFn !== undefined) {
      handleFn(value as any);
      return true;
    }
  }

  return false;
}
