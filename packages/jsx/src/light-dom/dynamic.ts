import { emitterKey, isAtom, untracked } from '@metron/core/particle.js';
import { COLLECTION_EMIT_TYPE_ALL_CHANGE, COLLECTION_EMIT_TYPE_KEY_CHANGE, COLLECTION_EMIT_TYPE_SLICE_CHANGE, isAtomCollection, type AtomCollection, type AtomCollectionEmitChange, type RawAtomCollection } from '@metron/core/collection.js';
import {
  createContext,
  render,
  type ComponentNode,
  type IntrinsicNode,
  type RenderContext,
  type ReadonlyUnknownRecord,
} from '../node.js';
import { isIterable, type Writable } from '../utils.js';
import type { LightDomElement } from './node.js';

export const dynamicLightDom: RenderContext = {
  renderComponent(element, contextStore) {
    const { tag, props } = element as ComponentNode;
    const componentContext = createContext(contextStore);

    const children = tag(props, componentContext);

    // TODO: convert to fragment and consolidate with renderIntrinsic
    const renderedChildren: unknown[] = [];
    if (isAtom(children)) {
      if (isAtomCollection(children)) {
        const keyIndexMap = new Map<unknown, number>();

        renderAtomCollection(this, children, keyIndexMap, renderedChildren, contextStore);

        children[emitterKey]((msg) => {
          switch (msg.type) {
            case COLLECTION_EMIT_TYPE_KEY_CHANGE:
              const { key } = msg;
              const index = keyIndexMap.get(key);

              if (index === undefined) {
                return;
              }

              renderedChildren[index] = render(
                untracked(children).get(key),
                contextStore,
                this
              );

              return;
            case COLLECTION_EMIT_TYPE_SLICE_CHANGE:
              // TODO
            case COLLECTION_EMIT_TYPE_ALL_CHANGE:
              renderedChildren.splice(0, Infinity);
              renderAtomCollection(this, children, keyIndexMap, renderedChildren, contextStore);
              return;
          }
        });
      } else if (isIterable(children)) {
        renderIterable(this, children, renderedChildren as unknown[], contextStore);

        children[emitterKey](() => {
          renderedChildren.splice(0, Infinity);
          renderIterable(this, children, renderedChildren as unknown[], contextStore);
        });
      } else {
        renderedChildren[0] = render(untracked(children), contextStore, this);

        children[emitterKey](() => {
          renderedChildren[0] = render(untracked(children), contextStore, this);
        });
      }
    } else if (isIterable(children)) {
      renderIterable(this, children, renderedChildren as unknown[], contextStore);
    } else {
      return render(children, contextStore, this);
    }

    return renderedChildren;
  },
  renderOther(element) {
    return String(element);
  },
  renderIntrinsic(element, contextStore): LightDomElement {
    const { tag, props } = element as IntrinsicNode;
    const { children, ...restProps } = props;

    const attributes: Writable<LightDomElement["attributes"]> = {};

    const renderedNode: Writable<LightDomElement> = {
      tag,
      attributes,
      children: [],
    };


    for (const [key, value] of Object.entries(restProps)) {
      if (isAtom(value)) {
        attributes[key] = String(untracked(value));

        value[emitterKey](() => {
          attributes[key] = String(untracked(value));
        });
      } else {
        attributes[key] = String(value);
      }
    }

    if (isAtom(children)) {
      if (isAtomCollection(children)) {
        let renderedChildren: unknown[] = [];
        renderedNode.children = renderedChildren;
        const keyIndexMap = new Map<unknown, number>();

        renderAtomCollection(this, children, keyIndexMap, renderedChildren, contextStore);

        children[emitterKey]((msg) => {
          switch (msg.type) {
            case COLLECTION_EMIT_TYPE_KEY_CHANGE:
              const { key } = msg;
              const index = keyIndexMap.get(key);

              if (index === undefined) {
                return;
              }

              renderedChildren[index] = render(
                untracked(children).get(key),
                contextStore,
                this
              );

              return;
            case COLLECTION_EMIT_TYPE_SLICE_CHANGE:
              // TODO
            case COLLECTION_EMIT_TYPE_ALL_CHANGE:
              renderedNode.children = renderedChildren = [];
              renderAtomCollection(this, children, keyIndexMap, renderedChildren, contextStore);
              return;
        });
      } else if (isIterable(children)) {
        renderedNode.children = [];

        renderIterable(this, children, renderedNode.children as unknown[], contextStore);

        children[emitterKey](() => {
          renderedNode.children = [];

          renderIterable(this, children, renderedNode.children as unknown[], contextStore);
        });
      } else {
        renderedNode.children = [render(untracked(children), contextStore, this)];

        children[emitterKey](() => {
          renderedNode.children = [render(untracked(children), contextStore, this)];
        });
      }
    } else if (isIterable(children)) {
      renderedNode.children = [];
      renderIterable(this, children, renderedNode.children as unknown[], contextStore);
    } else {
      renderedNode.children = [render(children, contextStore, this)];
    }

    return renderedNode;
  },
};

function renderIterable(renderContext: RenderContext, children: Iterable<unknown>, renderedChildren: unknown[], contextStore: ReadonlyUnknownRecord) {
  for (const child of children) {
    renderedChildren.push(render(child, contextStore, renderContext));
  }
}

function renderAtomCollection(renderContext: RenderContext, children: AtomCollection<unknown, unknown, RawAtomCollection<unknown, unknown>, AtomCollectionEmitChange<unknown>>, keyIndexMap: Map<unknown, number>, renderedChildren: unknown[], contextStore: ReadonlyUnknownRecord) {
  let i = 0;
  for (const [key, child] of untracked(children).entries()) {
    keyIndexMap.set(key, i);
    renderedChildren.push(render(child, contextStore, renderContext));
    i++;
  }
}

