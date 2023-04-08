export function Component({}: { foo?: boolean; bar: true }) {
  return <div>hello</div>;
}

export async function AsyncComponent({}: { foo?: boolean; bar: true }) {
  const message = await Promise.resolve('hello');
  return <div>{message}</div>;
}

// @ts-expect-error
const a = <AsyncComponent bar />;

export function* GeneratorComponent({}: { foo?: boolean; bar: true }) {
  let i = 100;
  while (i) {
    yield <div>${i}</div>;
    --i;
  }

  return <div>Done</div>;
}

// @ts-expect-error
const g = <GeneratorComponent bar foo />;
