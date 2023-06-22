import type { Atom } from '@metron/core';

interface EventHandler {
  (ev: Event): void;
}

type BaseIntrinsic = {
  [fallback: string]: unknown;
  [prop: `prop:${string}`]: unknown;
  [attr: `attr:${string}`]:
    | Atom<undefined | string | boolean>
    | undefined
    | string
    | boolean;
  [on: `on:${string}`]:
    | Atom<EventHandler | undefined>
    | EventHandler
    | undefined;
};

export interface IntrinsicElements {
  [tagName: string]: BaseIntrinsic;
}
