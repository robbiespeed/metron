import { isAtom, untracked } from '@metron/core/particle.js';
import {
  createContext,
  renderNode,
  type ComponentNode,
  type IntrinsicNode,
  type RenderContext,
} from '../node.js';
import { isIterable, type WritableDeep } from '../utils.js';
import { LightDomElement, LightDomNode } from './node.js';

export const staticLightDom = {
  renderComponent(element, contextStore): LightDomNode {
    const { tag, props } = element as ComponentNode;
    const componentContext = createContext(contextStore);

    const children = tag(props, componentContext);

    const renderedFragment = new LightDomNode() as WritableDeep<LightDomNode>;

    const childrenUnwrapped = isAtom(children) ? untracked(children) : children;

    if (isIterable(childrenUnwrapped)) {
      for (const child of childrenUnwrapped) {
        renderedFragment.children.push(renderNode(child, contextStore, this));
      }
    } else {
      renderedFragment.children[0] = renderNode(
        childrenUnwrapped,
        contextStore,
        this
      );
    }

    return renderedFragment;
  },
  render(element): string {
    return String(element);
  },
  renderIntrinsic(element, contextStore): LightDomElement {
    const { tag, props } = element as IntrinsicNode;
    const { children, ...restProps } = props;

    const renderedElement = new LightDomElement(
      tag
    ) as WritableDeep<LightDomElement>;

    const { attributes } = renderedElement;

    for (const [key, value] of Object.entries(restProps)) {
      attributes[key] = isAtom(value)
        ? String(untracked(value))
        : String(value);
    }

    const childrenUnwrapped = isAtom(children) ? untracked(children) : children;

    if (isIterable(childrenUnwrapped)) {
      for (const child of childrenUnwrapped) {
        renderedElement.children.push(renderNode(child, contextStore, this));
      }
    } else {
      renderedElement.children[0] = renderNode(
        childrenUnwrapped,
        contextStore,
        this
      );
    }

    return renderedElement;
  },
} satisfies RenderContext;
