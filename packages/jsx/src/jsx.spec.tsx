import type { JSX } from '@metron/jsx/jsx-runtime';
import { expect } from 'chai';

describe('jsx', () => {
  it('should output a intrinsic jsx node', () => {
    const node = <test foo bar={1} />;

    expect(node).to.deep.contain({
      tag: 'test',
      props: { foo: true, bar: 1 },
      children: undefined,
    } satisfies Partial<JSX.IntrinsicNode>);
  });
});
