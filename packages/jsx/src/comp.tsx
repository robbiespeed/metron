type Props = { foo?: boolean; bar: true; children?: unknown };

export function Component({}: Props) {
  return (
    <div foo bar>
      <span>hello</span>
      <span>world</span>
      <list>
        {{
          foo: 'bar',
        }}
      </list>
    </div>
  );
}

export const f = <>foo</>;

<Component bar key="1">
  foo
</Component>;

<Component bar key="1" {...{ test: 'foo' }}>
  <foo {...{ [Symbol.for('foo')]: 'foo' }}>bar</foo>
</Component>;

// export async function AsyncComponent({}: Props) {
//   const message = await Promise.resolve('hello');
//   return <div>{message}</div>;
// }

// const a = (
//   <AsyncComponent bar key="1">
//     {'foo'}
//   </AsyncComponent>
// );

// export function* GeneratorComponent({}: Props) {
//   let i = 100;
//   while (i) {
//     yield <div>${i}</div>;
//     --i;
//   }

//   return <div>Done</div>;
// }

// <GeneratorComponent bar foo key={undefined} />;

export function StringComponent({}: Props) {
  return 'hello';
}

// const s = <StringComponent bar />;
