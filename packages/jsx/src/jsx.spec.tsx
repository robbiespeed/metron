import { expect } from 'chai';
import { type JSXIntrinsicNode } from './node.js';

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

// declare const state: any;

// const AnyFn: any = () => {};
// const $Condition = AnyFn;
// const $ = AnyFn;
// const $If = AnyFn;
// const $Switch = AnyFn;
// const Switch = AnyFn;
// const Case = AnyFn;
// const Default = AnyFn;
// const If = AnyFn;
// const ElseIf = AnyFn;
// const Else = AnyFn;
// const mapped = AnyFn;

// $If(state, <div>Hello</div>)
//   .elseIf(
//     mapped(state, (v: any) => v === 0),
//     <div>Hmm...</div>
//   )
//   .else(<div>Fallback</div>)
//   .end();

// flowIf(state, <div>Hello</div>)
//   .elseIf(
//     mapped(state, (v: any) => v === 0),
//     <div>Hmm...</div>
//   )
//   .else(<div>Fallback</div>);

// $(
//   If(state, <div>Hello</div>),
//   ElseIf(
//     mapped(state, (v: any) => v === 0),
//     <div>Hmm...</div>
//   ),
//   Else(<div>Fallback</div>)
// );

// mapped(state, (v: number) =>
//   v ? <div>Hello</div> : v === 0 ? <div>Hmm...</div> : <div>Fallback</div>
// );

// mapped(state, (v: number) => {
//   if (v) {
//     return <div>Hello</div>;
//   } else if (v === 0) {
//     return <div>Hmm...</div>;
//   } else {
//     return <div>Fallback</div>;
//   }
// });

// $Switch(state)
//   .case(1, <div>Hello 1</div>)
//   .case(2, <div>Hello 2</div>)
//   .default(<div>Fallback</div>)
//   .end();

// flowSwitch(state)
//   .case(1, <div>Hello 1</div>)
//   .case(2, <div>Hello 2</div>)
//   .default(<div>Fallback</div>);

// Switch(state)
//   .Case(1, <div>Hello 1</div>)
//   .Case(2, <div>Hello 2</div>)
//   .Default(<div>Fallback</div>);

// Switch(state, [
//   Switch.Case(1, <div>Hello 1</div>),
//   Switch.Case(2, <div>Hello 2</div>),
//   Switch.Default(<div>Fallback</div>),
// ]);

// Switch(state, [
//   Case(1, <div>Hello 1</div>),
//   Case(2, <div>Hello 2</div>),
//   Default(<div>Fallback</div>),
// ]);
