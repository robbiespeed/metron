import { render } from '@metron/jsx/node.js';
import { domRender } from '@metron/jsx/web-dom/render.js';
import './style.css';
import typescriptLogo from './typescript.svg';
import viteLogo from '/vite.svg';
import { Counter } from './counter.tsx';

const App = (
  <div>
    <a href="https://vitejs.dev" target="_blank">
      <img src={viteLogo} class="logo" alt="Vite logo" />
    </a>
    <a href="https://www.typescriptlang.org/" target="_blank">
      <img src={typescriptLogo} class="logo vanilla" alt="TypeScript logo" />
    </a>
    <h1>Vite + TypeScript</h1>
    <div class="card">
      <Counter />
    </div>
    <p class="read-the-docs">
      Click on the Vite and TypeScript logos to learn more
    </p>
  </div>
);

document
  .querySelector<HTMLDivElement>('#app')!
  .appendChild(render(App, {}, domRender) as Node);
