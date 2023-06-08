// import { emitterKey, isAtom, untracked } from '@metron/core/particle.js';
// import {
//   COLLECTION_EMIT_TYPE_ALL_CHANGE,
//   COLLECTION_EMIT_TYPE_KEY_CHANGE,
//   COLLECTION_EMIT_TYPE_SLICE_CHANGE,
//   isAtomCollection,
//   type AtomCollection,
//   type AtomCollectionEmitChange,
//   type RawAtomCollection,
// } from '@metron/core/collection.js';
// import {
//   createContext,
//   renderNode,
//   type ComponentNode,
//   type IntrinsicNode,
//   type RenderContext,
// } from '../node.js';
// import { isIterable, type WritableDeep } from '../utils.js';
// import { LightDomNode, LightDomElement } from './node.js';

// export const dynamicLightDom = {
//   renderComponent(element, contextStore): LightDomNode {
//     const { tag, props } = element as ComponentNode;
//     const componentContext = createContext(contextStore);

//     const children = tag(props, componentContext);

//     const renderedFragment = new LightDomNode() as WritableDeep<LightDomNode>;

//     renderChildrenIntoNode(children, renderedFragment, contextStore, this);

//     return renderedFragment;
//   },
//   render(element): string {
//     return String(element);
//   },
//   renderIntrinsic(element, contextStore): LightDomElement {
//     const { tag, props } = element as IntrinsicNode;
//     const { children, ...restProps } = props;

//     const renderedElement = new LightDomElement(
//       tag
//     ) as WritableDeep<LightDomElement>;

//     const { attributes } = renderedElement;

//     for (const [key, value] of Object.entries(restProps)) {
//       if (isAtom(value)) {
//         attributes[key] = String(untracked(value));

//         value[emitterKey](() => {
//           attributes[key] = String(untracked(value));
//         });
//       } else {
//         attributes[key] = String(value);
//       }
//     }

//     renderChildrenIntoNode(children, renderedElement, contextStore, this);

//     return renderedElement;
//   },
// } satisfies RenderContext;

// function renderChildrenIntoNode(
//   children: unknown,
//   renderedNode: { children: unknown[] },
//   contextStore: ReadonlyUnknownRecord,
//   renderContext: RenderContext
// ) {
//   if (isAtom(children)) {
//     if (isAtomCollection(children)) {
//       const keyIndexMap = new Map<unknown, number>();

//       pushRenderAtomCollection(
//         children,
//         keyIndexMap,
//         renderedNode.children,
//         contextStore,
//         renderContext
//       );

//       children[emitterKey]((msg) => {
//         switch (msg.type) {
//           case COLLECTION_EMIT_TYPE_KEY_CHANGE:
//             const { key } = msg;
//             let index = keyIndexMap.get(key);

//             const newChild = untracked(children).get(key);

//             if (index === undefined) {
//               if (newChild == null) {
//                 return;
//               }

//               index = renderedNode.children.length;
//               keyIndexMap.set(key, index);

//               renderedNode.children.push(
//                 renderNode(newChild, contextStore, renderContext)
//               );

//               return;
//             }

//             const oldRenderedChild = renderedNode.children[index];

//             if (oldRenderedChild) {
//               if (newChild == null) {
//                 keyIndexMap.delete(key);
//                 renderedNode.children.pop();
//                 return;
//               }

//               renderedNode.children[index] = renderNode(
//                 newChild,
//                 contextStore,
//                 renderContext
//               );
//             }

//             return;
//           case COLLECTION_EMIT_TYPE_SLICE_CHANGE:
//           // TODO
//           case COLLECTION_EMIT_TYPE_ALL_CHANGE:
//             renderedNode.children = [];
//             pushRenderAtomCollection(
//               children,
//               keyIndexMap,
//               renderedNode.children,
//               contextStore,
//               renderContext
//             );
//             return;
//         }
//       });
//     } else if (isIterable(children)) {
//       pushRenderIterable(
//         children,
//         renderedNode.children,
//         contextStore,
//         renderContext
//       );

//       children[emitterKey](() => {
//         renderedNode.children = [];
//         pushRenderIterable(
//           children,
//           renderedNode.children,
//           contextStore,
//           renderContext
//         );
//       });
//     } else {
//       renderedNode.children[0] = renderNode(
//         untracked(children),
//         contextStore,
//         renderContext
//       );

//       children[emitterKey](() => {
//         renderedNode.children[0] = renderNode(
//           untracked(children),
//           contextStore,
//           renderContext
//         );
//       });
//     }
//   } else if (isIterable(children)) {
//     pushRenderIterable(
//       children,
//       renderedNode.children,
//       contextStore,
//       renderContext
//     );
//   } else {
//     renderedNode.children[0] = renderNode(
//       children,
//       contextStore,
//       renderContext
//     );
//   }
// }

// function pushRenderIterable(
//   children: Iterable<unknown>,
//   renderedChildren: unknown[],
//   contextStore: ReadonlyUnknownRecord,
//   renderContext: RenderContext
// ) {
//   for (const child of children) {
//     renderedChildren.push(renderNode(child, contextStore, renderContext));
//   }
// }

// function pushRenderAtomCollection(
//   children: AtomCollection<
//     unknown,
//     unknown,
//     RawAtomCollection<unknown, unknown>,
//     AtomCollectionEmitChange<unknown>
//   >,
//   keyIndexMap: Map<unknown, number>,
//   renderedChildren: unknown[],
//   contextStore: ReadonlyUnknownRecord,
//   renderContext: RenderContext
// ) {
//   let i = 0;
//   for (const [key, child] of untracked(children).entries()) {
//     keyIndexMap.set(key, i);
//     renderedChildren.push(renderNode(child, contextStore, renderContext));
//     i++;
//   }
// }
