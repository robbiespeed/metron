import { expect } from 'chai';
import type { JsxIntrinsicNode } from './node.js';

describe('jsx', () => {
  it('should output a intrinsic jsx node', () => {
    const node = <test foo bar={1} />;

    expect(node).to.deep.contain({
      tag: 'test',
      props: { foo: true, bar: 1 },
    } satisfies Partial<JsxIntrinsicNode>);
  });
  it('test', () => {
    function ListItem({ i }: { readonly i: number }) {
      return <li>{i}</li>;
    }

    <ListItem i={1} />;
  });
});
