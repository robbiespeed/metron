import type { Disposer } from '@metron/core/emitter';
import {
  createStaticComponent,
  nodeBrandKey,
  type JsxRawNode,
} from '../node.js';

export function template<TProps extends object>(
  templateCreator: () => Element,
  init: (element: Element, props: TProps) => Disposer | undefined
): (props: TProps) => JsxRawNode {
  let templateElement: Element | undefined;
  return createStaticComponent((props: TProps) => {
    const element = (templateElement ??= templateCreator()).cloneNode(
      true
    ) as Element;

    return {
      [nodeBrandKey]: true,
      nodeType: 'Raw',
      value: element,
      disposer: init(element, props),
    };
  });
}
