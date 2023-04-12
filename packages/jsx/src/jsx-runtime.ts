export interface _Element {
  tag: unknown;
  props: unknown;
}

declare namespace JSX {
  interface IntrinsicElements {
    [tagName: string]: {};
  }
  interface ElementChildrenAttribute {
    children: {}; // specify children name to use
  }
  interface IntrinsicAttributes {
    key?: {};
  }
  interface Element {}
}

export function jsx(tag: unknown, props: unknown) {
  return { tag, props };
}

export type { JSX };
