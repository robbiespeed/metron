import { isAtom, untracked } from '@metron/core/particle.js';
import {
  createContext,
  render,
  type ComponentNode,
  type IntrinsicNode,
  type RenderContext,
} from '../node.js';
import { isIterable } from '../utils.js';

export const staticLightDom: RenderContext = {
  renderComponent(element, contextStore) {
    const { tag, props } = element as ComponentNode;
    const componentContext = createContext(contextStore);

    const children = tag(props, componentContext);

    return render(children, contextStore, this);
  },
  renderElement(element, contextStore) {
    if (isAtom(element)) {
      return render(untracked(element), contextStore, this);
    }
    if (isIterable(element)) {
      const elementArray = Array.isArray(element)
        ? element
        : Array.from(element);

      return elementArray.map((child) => render(child, contextStore, this));
    }
    return element;
  },
  renderIntrinsic(element, contextStore) {
    const { tag, props } = element as IntrinsicNode;
    const children = props.children;

    return {
      tag,
      props: {
        ...props,
        children: render(children, contextStore),
      },
    };
  },
};
