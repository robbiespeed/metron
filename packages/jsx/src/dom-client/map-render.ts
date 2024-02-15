// import type { AtomArray } from '@metron/core/collections/array.js';
// import {
//   IS_NODE,
//   IS_STATIC_COMPONENT,
//   NODE_TYPE_ADVANCED,
//   type JSXAdvancedNode,
//   type JSXProps,
//   type Component,
// } from '../node.js';
// import type { JSXContext } from '../context.js';
// import type { Disposer } from '@metron/core/shared.js';
// import { type TemplateComponent } from './template.js';
// import { subscribe } from '@metron/core/atom.js';
// import {
//   ARRAY_CHANGE_STORE,
//   HINT_DELETE,
//   HINT_SWAP,
// } from '@metron/core/collections/array/change-store.js';
// import {
//   eReplaceChildren,
//   nAppendChild,
//   nInsertBefore,
// } from './dom-methods.js';
// import { renderInto } from './render.js';

// interface MapRenderProps<TValue extends JSXProps> {
//   each: AtomArray<TValue>;
//   as: Component<TValue>;
// }

// export function MapRender<TValue extends JSXProps>(
//   props: MapRenderProps<TValue>
// ): JSXAdvancedNode<MapRenderProps<TValue>> {
//   return {
//     [IS_NODE]: true,
//     nodeType: NODE_TYPE_ADVANCED,
//     props,
//     tag: renderAtomArray,
//   };
// }
// (MapRender as any)[IS_STATIC_COMPONENT] = true;

// const BOUNDS_END = Symbol();

// const emptyArray = [] as [];

// function renderAtomArray<TValue extends {}>(
//   props: MapRenderProps<TValue>,
//   context: JSXContext,
//   registerDispose: (dispose: Disposer) => void,
//   parent: ParentNode,
//   tail: ChildNode | null
// ): undefined {
//   const insertBefore = nInsertBefore.bind(parent);

//   const array = props.each;
//   const createElement = props.as;

//   let values = array.unwrap().slice();
//   let size = values.length;

//   const indexedNodes: (ChildNode | null)[] = new Array(size);
//   // TODO: this could be removed if disposer was attached to element
//   let indexedDisposers: Disposer[][] = new Array(size);

//   let range: Range | undefined;
//   let clearNodes: () => void;

//   if (parent.firstChild !== null) {
//     if (tail === null) {
//       tail = document.createComment('');
//       parent.insertBefore(tail, null);
//     }

//     clearNodes = () => {
//       range ??= document.createRange();
//       range.setStartBefore(indexedNodes[0]!);
//       range.setEndBefore(tail!);
//       range.deleteContents();
//     };
//   } else {
//     clearNodes = () => (parent.textContent = null);
//   }

//   let i = 0;
//   // let ii = 0;

//   let appendElements: () => undefined;

//   if (tail === null) {
//     appendElements = () => {
//       indexedNodes.length = size;
//       indexedDisposers.length = size;

//       let prev: ChildNode | null = parent.lastChild;

//       for (; i < size; i++) {
//         const value = values[i]!;
//         if (value == null) {
//           indexedNodes[i] = null;
//           indexedDisposers[i] = emptyArray;
//           continue;
//         }
//         const disposers: Disposer[] = [];
//         indexedDisposers[i] = disposers;

//         renderInto(
//           value,
//           context,
//           (dispose) => {
//             disposers.push(dispose);
//           },
//           parent,
//           tail
//         );
//         prev = prev?.nextSibling ?? parent.firstChild;
//         indexedNodes[i] = prev;

//         if (prev !== null) {
//           const lastNode = parent.lastChild;
//           if (lastNode !== prev) {
//             (prev as any)[BOUNDS_END] = lastNode;
//             prev = lastNode;
//           }
//         }
//       }
//     };
//   } else {
//     appendElements = () => {
//       indexedNodes.length = size;
//       indexedDisposers.length = size;

//       let prev: ChildNode | null = tail!.previousSibling;

//       for (; i < size; i++) {
//         const value = values[i]!;
//         if (value == null) {
//           indexedNodes[i] = null;
//           indexedDisposers[i] = emptyArray;
//           continue;
//         }
//         const disposers: Disposer[] = [];
//         indexedDisposers[i] = disposers;

//         renderInto(
//           value,
//           context,
//           (dispose) => {
//             disposers.push(dispose);
//           },
//           parent,
//           tail
//         );
//         prev = prev?.nextSibling ?? parent.firstChild;
//         indexedNodes[i] = prev;

//         if (prev !== null) {
//           const lastNode = parent.lastChild;
//           if (lastNode !== prev) {
//             (prev as any)[BOUNDS_END] = lastNode;
//             prev = lastNode;
//           }
//         }
//       }
//     };
//   }

//   // function appendElements() {
//   //   // ii = i;
//   //   indexedNodes.length = size;
//   //   indexedDisposers.length = size;

//   //   let prev: ChildNode | null = tail === null ? parent.lastChild : tail.previousSibling;

//   //   for (; i < size; i++) {
//   //     const value = values[i]!;
//   //     if (value == null) {
//   //       indexedNodes[i] = null;
//   //       indexedDisposers[i] = emptyArray;
//   //       continue;
//   //     }
//   //     const disposers: Disposer[] = [];
//   //     indexedDisposers[i] = disposers;

//   //     renderInto();
//   //     const element = createElement(values[i]!, context, (dispose) => {
//   //       disposers.push(dispose);
//   //     });
//   //     indexedNodes[i] = element;
//   //     insertBefore(element, tail);
//   //     // append(element);
//   //   }
//   //   // eAppend.apply(parent, indexedNodes.slice(ii));
//   //   // for (; ii < size; ii++) {
//   //   //   // nAppendChild.call(parent, indexedNodes[ii]!);
//   //   //   insertBefore(indexedNodes[ii]!, null);
//   //   // }
//   // }
//   appendElements();

//   const changeStore = array[ARRAY_CHANGE_STORE];
//   let changeToken = changeStore.nextConnectionToken;

//   const disposeSubscribe = subscribe(array, () => {
//     const nextValues = array.unwrap();
//     const prevSize = size;
//     const prevValues = values;
//     size = nextValues.length;

//     const change = changeStore.get(changeToken);
//     changeToken = changeStore.nextConnectionToken;

//     // Clear fast path
//     if (size === 0) {
//       disposeIndexed(indexedDisposers);
//       indexedDisposers.length = 0;
//       // const oldIndexedDisposers = indexedDisposers;
//       // requestIdleCallback(() => disposeIndexed(oldIndexedDisposers));
//       // indexedDisposers = [];
//       indexedNodes.length = 0;
//       clearNodes();
//       values = emptyArray;

//       return;
//     } else {
//       values = nextValues.slice();
//     }

//     let start: number;

//     if (change !== undefined) {
//       start = change.start;
//       switch (change.hint) {
//         case HINT_DELETE: {
//           parent.removeChild(indexedNodes[start]!);
//           for (const d of indexedDisposers[start]!) {
//             d();
//           }
//           indexedNodes.splice(start, 1);
//           indexedDisposers.splice(start, 1);
//           return;
//         }
//         case HINT_SWAP: {
//           const b = change.data;

//           const aNode = indexedNodes[start]!;
//           const bNode = indexedNodes[b]!;
//           const afterB = bNode.nextSibling;
//           insertBefore(bNode, aNode);
//           insertBefore(aNode, afterB);

//           const tmpN = indexedNodes[start]!;
//           indexedNodes[start] = indexedNodes[b]!;
//           indexedNodes[b] = tmpN;

//           const tmpD = indexedDisposers[start]!;
//           indexedDisposers[start] = indexedDisposers[b]!;
//           indexedDisposers[b] = tmpD;
//           return;
//         }
//       }
//     }

//     // Skip unchanged head values
//     const lowEnd = size > prevSize ? prevSize : size;
//     for (
//       start = 0;
//       start < lowEnd && prevValues[start] === values[start];
//       start++
//     );

//     // Append fast path
//     if (start === prevSize) {
//       i = start;
//       appendElements();
//       return;
//     }

//     // Clear DOM from start to avoid shuffling
//     if (start === 0) {
//       clearNodes();
//     } else if (start < prevSize) {
//       range ??= document.createRange();
//       range.setStartBefore(indexedNodes[start]!);
//       range.setEndAfter(indexedNodes[prevSize - 1]!);
//       range.deleteContents();

//       // Trim fast path
//       if (start === size) {
//         indexedNodes.length = size;
//         disposeIndexed(indexedDisposers.splice(start));
//         return;
//       }
//     }
//     // No change
//     else if (start === size) {
//       return;
//     }

//     const unstableDisposers = indexedDisposers.slice(start);
//     const unstableNodes = indexedNodes.slice(start);
//     const unstableSize = unstableNodes.length;
//     const unstableLookup = new Map<TValue, number | undefined>();
//     const unstableChain: (number | undefined)[] = new Array(unstableSize);

//     indexedNodes.length = size;
//     indexedDisposers.length = size;

//     i = prevSize - 1;
//     for (let j = unstableSize - 1; i >= start; i--, j--) {
//       const value = prevValues[i]!;
//       unstableChain[j] = unstableLookup.get(value);
//       unstableLookup.set(value, j);
//     }

//     let unstableUnusedCount = unstableSize;

//     for (i = start; i < size; i++) {
//       const value = values[i]!;
//       const unstableIndex = unstableLookup.get(value);
//       if (unstableIndex === undefined) {
//         const disposers: Disposer[] = [];
//         indexedDisposers[i] = disposers;
//         const element = createElement(values[i]!, context, (dispose) => {
//           disposers.push(dispose);
//         });
//         indexedNodes[i] = element;
//         insertBefore(element, null);

//         continue;
//       }

//       unstableLookup.set(value, unstableChain[unstableIndex]);

//       const node = unstableNodes[unstableIndex]!;
//       const disposers = unstableDisposers[unstableIndex]!;
//       unstableDisposers[unstableIndex] = emptyArray;
//       unstableUnusedCount--;

//       indexedDisposers[i] = disposers;
//       indexedNodes[i] = node;
//       insertBefore(node, null);
//     }

//     if (unstableUnusedCount > 0) {
//       disposeIndexed(unstableDisposers);
//       // requestIdleCallback(() => disposeIndexed(unstableDisposers));
//     }
//   });

//   registerDispose(() => {
//     disposeSubscribe();
//     disposeIndexed(indexedDisposers);
//   });
// }

// function disposeIndexed(indexedDisposers: Disposer[][]) {
//   for (const disposers of indexedDisposers) {
//     for (const d of disposers) {
//       d();
//     }
//   }
// }
