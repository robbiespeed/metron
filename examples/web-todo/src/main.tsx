import { render } from 'metron-jsx/web-dom/render.js';
import './style.css';
import { TodoList } from './todo-list.tsx';

const root = document.querySelector<HTMLDivElement>('#app')!;

const App = (
  <>
    <h1>Metron Todo</h1>
    <TodoList />
  </>
);

render({
  root,
  children: App,
});
