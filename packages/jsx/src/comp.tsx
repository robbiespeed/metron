type Props = { foo?: boolean; bar: true; children?: string };

export function Component({}: Props) {
  return <div>hello</div>;
}

<Component bar key="1">
  foo
</Component>;

export async function AsyncComponent({}: Props) {
  const message = await Promise.resolve('hello');
  return <div>{message}</div>;
}

const a = (
  <AsyncComponent bar key="1">
    {'foo'}
  </AsyncComponent>
);

export function* GeneratorComponent({}: Props) {
  let i = 100;
  while (i) {
    yield <div>${i}</div>;
    --i;
  }

  return <div>Done</div>;
}

<GeneratorComponent bar foo key={undefined} />;
