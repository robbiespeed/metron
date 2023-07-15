import { jsx, jsxs, Fragment, type JSX as BaseJSX } from '../jsx-runtime.js';
import type { IntrinsicElements as BrowserIntrinsicElements } from '../dom-types/jsx.web.js';

declare namespace JSX {
  type IntrinsicElements = BrowserIntrinsicElements;

  type IntrinsicAttributes = BaseJSX.IntrinsicAttributes;

  type ElementChildrenAttribute = BaseJSX.ElementChildrenAttribute;

  type ElementType<TProps = unknown> = BaseJSX.ElementType<TProps>;

  type Element = BaseJSX.Element;
}

export type { JSX };
export { jsx, jsxs, jsx as jsxDEV, jsxs as jsxsDEV, Fragment };
