declare namespace JSX {
  interface IntrinsicElements {
    [tagName: string]: {};
  }
  interface ElementChildrenAttribute {
    childrenB: {}; // specify children name to use
  }
  interface Element {}
}

export function jsx(tag: unknown, props: unknown) {
  return { tag, props };
}

export type { JSX };
