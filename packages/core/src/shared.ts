export interface Disposer {
  (): undefined;
}

export const emptyFn = (): undefined => {};

/**
 * @experimental
 */
export class ExpiredReadContext extends Error {
  constructor() {
    super('Expired read context');
  }
}
