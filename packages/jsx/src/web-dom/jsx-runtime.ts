import type { Atom } from 'metron-core';
import { jsx, jsxs, Fragment, type JSX as BaseJSX } from '../jsx-runtime.js';

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

declare namespace JSX {
  interface IntrinsicElements {
    [tagName: string]: BaseIntrinsic;
  }

  type IntrinsicAttributes = BaseJSX.IntrinsicAttributes;

  type ElementChildrenAttribute = BaseJSX.ElementChildrenAttribute;

  type ElementType<TProps = unknown> = BaseJSX.ElementType<TProps>;

  type Element = BaseJSX.Element;
}

export type { JSX };
export { jsx, jsxs, jsx as jsxDEV, jsxs as jsxsDEV, Fragment };
