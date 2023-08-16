import { isAtom, type Disposer, isAtomList } from 'metron-core';
// import { type JSXIntrinsicNode } from 'metron-jsx/node.js';
import { createRootContext, type JSXContext } from '../context.js';
import { dispose } from 'metron-jsx/utils.js';
import { isJSXNode, type JSXIntrinsicNode } from 'metron-jsx/node.js';

// interface ServerDomRenderContextProps {
//   children: unknown;
// }

// abstract class AbstractServerNode {
//   abstract getHtml(): string;
// }

// class ServerIntrinsicNode extends AbstractServerNode {
//   readonly tag: string;

//   attributes: Record<string, string | boolean> = {};
//   props: Record<string, unknown> = {};
//   events: Record<string, () => void> = {};
//   children?: ServerNode[] = undefined;

//   constructor(tag: string) {
//     super();
//     this.tag = tag;
//   }

//   getHtml() {
//     const { tag } = this;
//     return `<${tag}></${tag}>`;
//   }
// }

interface AbstractServerNode {
  type: string;
  id: string;
}

interface ServerIntrinsicNode extends AbstractServerNode {
  type: 'Intrinsic';
  tag: string;
  attributes?: Record<string, string | boolean>;
  props?: Record<string, unknown>;
  events?: Record<string, () => void>;
  delegatedEvents?: Record<string, [unknown, () => void]>;
  children?: ServerNode[];
}

interface ServerIntrinsicParentNode extends ServerIntrinsicNode {
  children: ServerNode[];
}

interface ServerTextNode extends AbstractServerNode {
  type: 'Text';
  text: string;
}

interface ServerRootNode extends AbstractServerNode {
  type: 'Root';
  children: ServerNode[];
  // dispose: Disposer;
}

type ServerNode = ServerIntrinsicNode | ServerTextNode | string;

type ServerParentNode = ServerIntrinsicParentNode | ServerRootNode;

type NodeAppend = (node: ServerNode) => void;

const isArray = Array.isArray;

export function renderRoot(
  value: unknown,
  context?: JSXContext
): [ServerRootNode, Disposer] {
  const disposers: Disposer[] = [];
  const children: ServerNode[] = [];
  const root: ServerRootNode = {
    type: 'Root',
    id: 'TODO',
    children: children,
  };

  const rootDisposer = () => {
    dispose(disposers);
    disposers.length = 0;
  };

  const append = children.push.bind(children);
  const addDisposer = disposers.push.bind(disposers);

  context =
    context === undefined
      ? createRootContext(addDisposer)
      : { ...context, addDisposer };

  if (value != null) {
    renderInto(append, value, context, root);
  }

  return [root, rootDisposer];
}

function renderIntrinsic(
  parentAppend: NodeAppend,
  intrinsic: JSXIntrinsicNode,
  context: JSXContext
) {
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
}

function renderInto(
  append: NodeAppend,
  value: {},
  context: JSXContext,
  parent?: ServerParentNode | undefined
) {
  if (typeof value === 'object') {
    if (isJSXNode(value)) {
      switch (value.nodeType) {
        case 'Intrinsic':
          return renderIntrinsic(append, value, context);
        case 'Component':
          return;
        case 'ContextProvider':
          return;
      }
    } else if (isArray(value)) {
      for (const child of value) {
        if (child != null) {
          renderInto(append, child, context);
        }
      }
      return;
    } else if (isAtomList(value)) {
      // return renderAtomListInto(append, value, context, parent);
    } else if (isAtom(value)) {
      // How do we track and update after the fact

      // const firstValue = untracked(value);

      // const node: DynamicTextNode = {
      //   text: firstValue === undefined ? '' : `${firstValue}`,
      // };

      // append(node);

      // context.addDisposer(
      //   value[emitterKey](() => {
      //     const newValue = untracked(value);
      //     node.text = newValue === undefined ? '' : `${newValue}`;
      //   })
      // );
      return;
    }
  }
}
