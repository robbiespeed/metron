import type { ReadonlyUnknownRecord } from '../node.js';

export interface LightDomElement {
  readonly tag: string;
  readonly children: readonly unknown[];
  readonly attributes: ReadonlyUnknownRecord;
}

export interface LightDomFragment {
  readonly tag: string;
  readonly children: readonly unknown[];
  readonly attributes: ReadonlyUnknownRecord;
}
