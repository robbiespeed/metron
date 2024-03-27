import { render } from '@metron/jsx/dom-client/render.js';
import './style.css';
import { template } from '@metron/jsx/dom-client/template.js';

const root = document.querySelector<HTMLDivElement>('#app')!;

const App = (
  <>
    <h1>Metron Todo</h1>
  </>
);

const Bar = template<{ className: string }>(({ className }) => (
  <div class={className}>
    <span>Hello World</span>
  </div>
));

const x = (...args: any[]): any => {
  throw new Error('TODO');
};

const Foo = template<{ className: string }>(({ className }) =>
  x('div', {
    class: className,
    children: x('span', { children: 'Hello World' }),
  })
);

const Baz = templateX`
  <div class={className}>
    <span>Hello World</span>
  </div>
`;

const Fuz = template<{ className: string }>(({ className }) =>
  x('div', {
    class: className,
  })
);

render({
  root,
  children: App,
});
