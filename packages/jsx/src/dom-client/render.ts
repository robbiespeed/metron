import { createRootContext, disposeContext, Render } from '../context.js';
import { insertValue } from './element.js';
import type { Disposer } from '@metron/core/shared.js';

interface DomRenderContextProps {
  readonly root: ParentNode;
  readonly children: unknown;
}

export const EVENT_HANDLER_PREFIX = 'on:';
export const EVENT_HANDLER_PREFIX_LENGTH = EVENT_HANDLER_PREFIX.length;

export function render({ root, children }: DomRenderContextProps): Disposer {
  // const [renderContext, dispose] = createRootContext();
  const renderContext = createRootContext([[Render, insertValue]]);

  root.textContent = '';

  if (children != null) {
    insertValue(children, renderContext, root, null);
  }

  const dispose: Disposer = () => {
    disposeContext(renderContext);
  };

  (root as any)['__METRON_RENDER_DISPOSE'] = dispose;

  return dispose;
}
