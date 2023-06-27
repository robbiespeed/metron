# Metron JSX

## Install

```bash
pnpm add metron-core metron-jsx
```

Update tsconfig to use jsx runtime:

```jsonc
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "metron-jsx/web-dom"
  }
}
```

## Usage

```tsx
import { render } from 'metron-jsx/web-dom/render.js';

const appRoot = document.querySelector('#main');

function Header() {
  return <h1>Hello World</h1>;
}

const App = (
  <div>
    <Header />
  </div>
);

render({
  root: appRoot,
  children: App,
});
```

## Examples

If you'd like more info on the reactive primitives to use checkout the Metron Core [README](https://github.com/robbiespeed/metron/blob/main/packages/core/README.md).

### Counter Component

```tsx
import { createMutatorAtom } from 'metron-core/atom.js';

function Counter() {
  const [countAtom, updateCount] = createMutatorAtom(0);
  return (
    <button on:click={() => updateCount((oldCount) => oldCount + 1)}>
      Count: {countAtom}
    </button>
  );
}
```

### Todo List

Example code can be found [here](https://github.com/robbiespeed/metron/blob/main/examples/web-todo).
