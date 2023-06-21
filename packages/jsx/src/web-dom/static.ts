import { isJsxNode, type JsxNode } from '../node.js';

export function renderStatic(intrinsic: JsxNode): Element {
  if (intrinsic.nodeType !== 'Intrinsic') {
    throw new TypeError('Template may only contain intrinsic nodes');
  }

  const { children, ...props } = intrinsic.props as Record<string, unknown>;

  const element = document.createElement(intrinsic.tag);

  for (const [key, value] of Object.entries(props)) {
    switch (typeof value) {
      case 'string':
        element.setAttribute(key, value);
        break;
      case 'boolean':
        element.toggleAttribute(key, value);
        break;
    }
  }

  if (Array.isArray(children)) {
    const childNodes: ChildNode[] = [];
    for (const child of children) {
      if (isJsxNode(child)) {
        const childElement = renderStatic(child);
        childNodes.push(childElement);
      } else if (typeof child === 'string') {
        childNodes.push(document.createTextNode(child));
      }
    }
    element.append(...childNodes);
  } else if (children !== undefined) {
    if (isJsxNode(children)) {
      const childElement = renderStatic(children);
      element.appendChild(childElement);
    } else if (typeof children === 'string') {
      element.textContent = children;
    }
  }

  return element;
}
