// import { isJSXNode, type JSXNode } from '../node.js';

// export function renderStatic(intrinsic: JSXNode): Element {
//   if (intrinsic.nodeType !== 'Intrinsic') {
//     throw new TypeError('Static render may only contain intrinsic nodes');
//   }

//   const { children, ...props } = intrinsic.props as Record<string, unknown>;

//   const element = document.createElement(intrinsic.tag);

//   for (const [key, value] of Object.entries(props)) {
//     if (value === undefined) {
//       continue;
//     }
//     let [keySpecifier, keyName] = key.split(':', 2) as [string, string];
//     if (keySpecifier === key) {
//       keyName = keySpecifier;
//       keySpecifier = 'attr';
//     }
//     switch (keySpecifier) {
//       case 'attr':
//         if (value === true) {
//           element.toggleAttribute(keyName, true);
//         } else if (value !== false) {
//           element.setAttribute(keyName, value as string);
//         }
//         break;
//       default:
//         throw new TypeError(`Unsupported specifier "${keySpecifier}"`);
//     }
//   }

//   if (Array.isArray(children)) {
//     const childNodes: ChildNode[] = [];
//     for (const child of children) {
//       if (isJSXNode(child)) {
//         const childElement = renderStatic(child);
//         childNodes.push(childElement);
//       } else if (typeof child === 'string') {
//         childNodes.push(document.createTextNode(child));
//       }
//     }
//     element.append(...childNodes);
//   } else if (children !== undefined) {
//     if (isJSXNode(children)) {
//       const childElement = renderStatic(children);
//       element.appendChild(childElement);
//     } else if (typeof children === 'string') {
//       element.textContent = children;
//     }
//   }

//   return element;
// }
