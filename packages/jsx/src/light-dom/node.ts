export class LightDomNode {
  readonly children: readonly unknown[] = [];
}

export class LightDomElement extends LightDomNode {
  readonly tag: string;
  readonly attributes: {
    readonly [key: string]: string;
  } = {};

  constructor(tag: string) {
    super();
    this.tag = tag;
  }
}
