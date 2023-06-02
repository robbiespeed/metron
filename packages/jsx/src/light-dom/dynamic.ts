import { emitterKey, isAtom, untracked } from '@metron/core/particle.js';
import {
  createContext,
  render,
  type ComponentNode,
  type IntrinsicNode,
  type RenderContext,
} from '../node.js';
import { isIterable } from '../utils.js';

export const dynamicLightDom: RenderContext = {
  renderComponent(element, contextStore) {
    const { tag, props } = element as ComponentNode;
    const componentContext = createContext(contextStore);

    const children = tag(props, componentContext);

    return render(children, contextStore, this);
  },
  renderElement(element, contextStore) {
    if (isAtom(element)) {
      return render(untracked(element), contextStore);
    }
    if (isIterable(element)) {
      const elementArray = Array.isArray(element)
        ? element
        : Array.from(element);

      return elementArray.map((child) => render(child, contextStore, this));
    }
    return String(element);
  },
  renderIntrinsic(element, contextStore) {
    const { tag, props } = element as IntrinsicNode;
    const { children, ...restProps } = props;

    const nodeProps: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(restProps)) {
      if (isAtom(value)) {
        nodeProps[key] = String(untracked(value));

        value[emitterKey](() => {
          nodeProps[key] = String(untracked(value));
        });
      } else {
        nodeProps[key] = String(value);
      }
    }

    if (isAtom(children)) {
      nodeProps.children = render(untracked(children), contextStore, this);

      children[emitterKey](() => {
        nodeProps.children = render(untracked(children), contextStore, this);
      });
    } else {
      nodeProps.children = render(children, contextStore, this);
    }

    return {
      tag,
      props: nodeProps,
    };
  },
};
