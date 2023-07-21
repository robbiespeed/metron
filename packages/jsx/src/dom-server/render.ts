import type { Disposer } from 'metron-core';
// import { type JSXIntrinsicNode } from 'metron-jsx/node.js';
import { createRootContext, type JSXContext } from '../context.js';
import { dispose } from 'metron-jsx/utils.js';

// interface ServerDomRenderContextProps {
//   children: unknown;
// }

interface RenderedIntrinsicNode {
  tag: string;
  attributes: Record<string, string | boolean>;
  props: Record<string, unknown>;
  events: Record<string, () => void>;
  children?: RenderedNode[];
}

type RenderedNode = RenderedIntrinsicNode | string;

interface ServerRenderedRoot {
  children: RenderedNode[];
  dispose: Disposer;
}

type NodeAppend = (node: RenderedNode) => void;

export function renderRoot(
  value: unknown,
  context?: JSXContext
): ServerRenderedRoot {
  const disposers: Disposer[] = [];
  const renderedChildren: RenderedNode[] = [];
  const renderedRoot: ServerRenderedRoot = {
    children: renderedChildren,
    dispose: () => {
      dispose(disposers);
      disposers.length = 0;
    },
  };

  const append = renderedChildren.push.bind(renderedChildren);
  const addDisposer = disposers.push.bind(disposers);

  context =
    context === undefined
      ? createRootContext(addDisposer)
      : { ...context, addDisposer };

  if (value != null) {
    renderInto(append, value, context);
  }

  return renderedRoot;
}

// function renderIntrinsic(
//   parentAppend: NodeAppend,
//   intrinsic: JSXIntrinsicNode,
//   context: JSXContext
// ) {
//   const renderedChildren: RenderedNode[] = [];
//   const rendered: RenderedIntrinsicNode = {
//     tag: intrinsic.tag,
//     attributes: {},
//     props: {},
//     events: {},
//     children: renderedChildren,
//   };
//   const append = renderedChildren.push.bind(renderedChildren);

//   // TODO: attrs, props, events
//   // TODO: renderRoot registers "connectors" which get passed down. Connectors watch atoms for changes with specific handlers for lists, elements, text nodes, props, attrs, and events
//   // Static rendering would have no connectors and thus no atoms would be watched. using async components and async atoms would make for nice dev exp.
// }

function renderInto(append: NodeAppend, value: {}, context: JSXContext) {}
