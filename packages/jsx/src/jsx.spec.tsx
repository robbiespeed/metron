import { expect } from 'chai';
import type { JSXIntrinsicNode } from './node.js';

const Spread = (props: any) => {};
const MapRender = (props: any) => {};
const Foo = (props: any) => {};

describe('jsx', () => {
  it('should output a intrinsic jsx node', () => {
    const node = <test foo bar={1} />;

    expect(node).to.deep.contain({
      tag: 'test',
      props: { foo: true, bar: 1 },
    } satisfies Partial<JSXIntrinsicNode>);
  });
  it('test', () => {
    function ListItem({ i }: { readonly i: number }) {
      return <li>{i}</li>;
    }

    <ListItem i={1} />;
  });
});

const items: any[] = [];

<>
  <MapRender each={items} as={Foo} />
</>;
