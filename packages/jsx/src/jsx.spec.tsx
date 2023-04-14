import { expect } from 'chai';

describe('jsx', () => {
  it('should output a intrinsic jsx node', () => {
    const node = <test />;

    expect(node).to.equal({
      tag: 'test',
      props: {},
      children: [],
    });
  });
});
