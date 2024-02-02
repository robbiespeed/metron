export interface Disposer {
  (): undefined;
}

export const emptyFn = (): undefined => {};
