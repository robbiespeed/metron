// interface Bounds {
//   s: ChildNode;
//   e: ChildNode;
// }

// function createListDomOperators(
//   initAppend: NodeAppend,
//   parent: ParentNode | null
// ) {
//   let bounds: Bounds | undefined;

//   let append: (node: ChildNode) => void;
//   let clearNodes: () => void;
//   let insertBefore: (node: ChildNode, ref: ChildNode | null) => void;
//   let prepend: (node: ChildNode) => void;
//   let removeChild: (node: ChildNode) => void;
//   if (parent === null) {
//     const s = document.createTextNode('');
//     const e = document.createTextNode('');
//     bounds = { s, e };
//     initAppend(s);

//     let range: Range | undefined;

//     function initRange() {
//       range = document.createRange();
//       range.setStartAfter(s);
//       range.setEndBefore(e);
//       return range;
//     }

//     append = e.before.bind(e);
//     clearNodes = () => {
//       (range ?? initRange()).deleteContents();
//     };
//     insertBefore = (node, ref) => {
//       if (ref === null) {
//         append(node);
//       } else {
//         ref.before(node);
//       }
//     };
//     prepend = s.after.bind(s);
//     removeChild = (node) => node.remove();
//   } else {
//     append = parent.appendChild.bind(parent);
//     clearNodes = parent.replaceChildren.bind(parent);
//     insertBefore = parent.insertBefore.bind(parent);
//     prepend = parent.prepend.bind(parent);
//     removeChild = parent.removeChild.bind(parent);
//   }

//   const swapNodeRanges = (a: Bounds, b: Bounds) => {
//     const firstA = a.s;
//     const lastA = a.e;
//     const firstB = b.s;
//     const lastB = b.e;
//     const afterB = lastB.nextSibling;

//     if (firstA === lastA && firstB === lastB) {
//       insertBefore(firstB, firstA);
//       insertBefore(firstA, afterB);
//       return;
//     }

//     let next: ChildNode | null;
//     if (lastA !== firstB.previousSibling) {
//       next = firstB;
//       while (next !== null) {
//         const node: ChildNode = next;
//         insertBefore(node, firstA);
//         next = node === lastB ? null : next.nextSibling;
//       }
//     }

//     next = firstA;
//     while (next !== null) {
//       const node: ChildNode = next;
//       insertBefore(node, afterB);
//       next = node === lastA ? null : next.nextSibling;
//     }
//   };

//   const appendRange = ({ s, e }: Bounds) => {
//     let next: ChildNode | null = s;
//     while (next !== null) {
//       const node: ChildNode = next;
//       append(node);
//       next = node === e ? null : next.nextSibling;
//     }
//   };

//   const insertRangeBeforeNode = (
//     { s, e }: Bounds,
//     beforeRef: ChildNode | null
//   ) => {
//     let next: ChildNode | null = s;
//     while (next !== null) {
//       const node: ChildNode = next;
//       insertBefore(node, beforeRef);
//       next = node === e ? null : next.nextSibling;
//     }
//   };

//   const removeUntil = (s: ChildNode, e?: ChildNode) => {
//     let next: ChildNode | null = s;
//     while (next !== null) {
//       const node: ChildNode = next;
//       removeChild(node);
//       next = node === e ? null : next.nextSibling;
//     }
//   };

//   return {
//     bounds,
//     clearNodes,
//     append,
//     prepend,
//     swapNodeRanges,
//     appendRange,
//     insertRangeBeforeNode,
//     removeChild,
//     removeUntil,
//   };
// }

// type Empty = [];
// type NonEmptyIndexedItem = { d: Disposer[]; s: ChildNode; e: ChildNode };
// type EmptyIndexedItem = { d: Disposer[]; s: undefined; e: undefined };
// type IndexedItem = NonEmptyIndexedItem | EmptyIndexedItem;
// type IndexedItems = IndexedItem[];

// const EMPTY_ARRAY: Empty = [];
// const EMPTY_ITEM: EmptyIndexedItem = Object.freeze({
//   d: EMPTY_ARRAY,
//   s: undefined,
//   e: undefined,
// });

// // TODO: instead of passing in parent and creating dom operators, require that renderAtomListInto be passed dom operators directly
// export function renderAtomArrayInto(
//   parent: ParentNode | null,
//   initAppend: NodeAppend,
//   atomArray: AtomArray<unknown>,
//   context: JSXContext
// ) {
//   const {
//     bounds,
//     clearNodes,
//     append,
//     swapNodeRanges,
//     appendRange,
//     insertRangeBeforeNode,
//     removeUntil,
//   } = createListDomOperators(initAppend, parent);

//   const values = atomArray.unwrap();
//   const valuesLength = values.length;
//   let indexedItems: IndexedItems = new Array(valuesLength);

//   let indexedItem: IndexedItem = EMPTY_ITEM;

//   let innerIndexedAppend = initAppend;

//   function indexedAppend(node: ChildNode) {
//     indexedItem.s ??= node;
//     indexedItem.e = node;
//     innerIndexedAppend(node);
//   }

//   // TODO: bench reusing
//   // let nextDisposerContainer: Disposer[] = [];

//   function renderValueToIndex(value: unknown, i: number) {
//     if (value == null) {
//       indexedItems[i] = EMPTY_ITEM;
//     } else {
//       const childDisposers: Disposer[] = [];
//       indexedItems[i] = indexedItem = {
//         d: childDisposers,
//         s: undefined,
//         e: undefined,
//       };
//       // TODO: separate disposer from context
//       // Maybe registerDispose[CONTEXT] = context ?
//       // Or split context and dispose everywhere
//       renderInto(null, indexedAppend, value, {
//         ...context,
//         addDisposer: childDisposers.push.bind(childDisposers),
//       });
//     }
//   }

//   for (let i = 0; i < valuesLength; i++) {
//     renderValueToIndex(values[i], i);
//   }

//   indexedItem = EMPTY_ITEM;
//   if (bounds !== undefined) {
//     initAppend(bounds.e);
//   }
//   innerIndexedAppend = append;

//   const changeStore = atomArray[ARRAY_CHANGE_STORE];
//   let changeToken = changeStore.nextConnectionToken;

//   subscribe(atomArray, () => {
//     // const change = changeStore.get(changeToken);
//     const change = undefined;

//     if (change !== undefined) {
//       // TODO;
//       return;
//     }
//   });

//   function handleClear() {
//     const oldIndexedItems = indexedItems;
//     indexedItems = [];
//     requestIdleCallback(() => disposeIndexed(oldIndexedItems));
//     clearNodes();
//   }

//   function handleAdd({
//     key,
//     oldSize,
//   }: AtomCollectionMessageKeyAdd<number>['data']) {
//     const value = rawList.get(key);

//     if (key === oldSize) {
//       // Append
//       if (value == null) {
//         indexedItems.push(EMPTY_ITEM);
//         return;
//       }

//       const newDisposers: Disposer[] = [];
//       indexedItem = {
//         d: newDisposers,
//         s: undefined,
//         e: undefined,
//       } as IndexedItem;

//       renderInto(null, indexedAppend, value, {
//         ...context,
//         addDisposer: newDisposers.push.bind(newDisposers),
//       });

//       indexedItems.push(indexedItem);
//     } else {
//       // Splice
//       if (value == null) {
//         indexedItems.splice(key, 0, EMPTY_ITEM);
//         return;
//       }

//       const newDisposers: Disposer[] = [];
//       indexedItem = {
//         d: newDisposers,
//         s: undefined,
//         e: undefined,
//       } as IndexedItem;

//       const rightIndex = findIndexOfNodesToRight(indexedItems, key);
//       if (rightIndex < 0) {
//         renderInto(null, indexedAppend, value, {
//           ...context,
//           addDisposer: newDisposers.push.bind(newDisposers),
//         });
//       } else {
//         const rightNode = indexedItems[rightIndex]!.s!;
//         innerIndexedAppend = rightNode.before.bind(rightNode);
//         renderInto(null, indexedAppend, value, {
//           ...context,
//           addDisposer: newDisposers.push.bind(newDisposers),
//         });
//         innerIndexedAppend = append;
//       }

//       indexedItems.splice(key, 0, indexedItem);
//     }

//     indexedItem = EMPTY_ITEM;
//   }

//   function handleDelete({
//     key,
//     size,
//   }: AtomCollectionMessageKeyDelete<number>['data']) {
//     const oldIndexedItem = indexedItems[key]!;
//     const oldDisposers = oldIndexedItem.d;
//     if (oldDisposers !== EMPTY_ARRAY) {
//       scheduleCleanup(() => dispose(oldDisposers));
//     }
//     const s = oldIndexedItem.s;
//     if (s !== undefined) {
//       removeUntil(s, oldIndexedItem.e);
//     }

//     if (key === size) {
//       indexedItems.length = size;
//     } else {
//       indexedItems.splice(key, 1);
//     }
//   }

//   function handleSwap({
//     keySwap: [keyA, keyB],
//   }: AtomCollectionMessageKeySwap<number>['data']) {
//     const aIndexedItem = indexedItems[keyA]!;
//     const bIndexedItem = indexedItems[keyB]!;

//     if (aIndexedItem === bIndexedItem) {
//       // If A and B are the same they must both be EMPTY_ITEM
//       return;
//     }

//     const aStart = aIndexedItem.s;
//     if (aStart !== undefined) {
//       const bStart = bIndexedItem.s;
//       if (bStart !== undefined) {
//         swapNodeRanges(aIndexedItem, bIndexedItem);
//       } else {
//         const rightOfBIndex = findIndexOfNodesToRight(indexedItems, keyB);
//         if (rightOfBIndex < 0) {
//           appendRange(aIndexedItem);
//         } else {
//           insertRangeBeforeNode(aIndexedItem, indexedItems[rightOfBIndex]!.s!);
//         }
//       }
//     } else {
//       assertOverride<NonEmptyIndexedItem>(bIndexedItem);
//       const rightOfAIndex = findIndexOfNodesToRight(indexedItems, keyA);
//       if (rightOfAIndex < keyB) {
//         insertRangeBeforeNode(bIndexedItem, indexedItems[rightOfAIndex]!.s!);
//       }
//     }

//     indexedItems[keyA] = bIndexedItem;
//     indexedItems[keyB] = aIndexedItem;
//   }

//   function handleWrite({ key }: AtomCollectionMessageKeyWrite<number>['data']) {
//     indexedItem = indexedItems[key]!;
//     const oldStart = indexedItem.s;
//     const oldEnd = indexedItem.e;
//     const oldDisposers = indexedItem.d;
//     if (oldDisposers !== EMPTY_ARRAY) {
//       scheduleCleanup(() => dispose(oldDisposers));
//     }

//     const newValue = rawList.get(key);

//     if (newValue == null) {
//       indexedItems[key] = EMPTY_ITEM;
//     } else {
//       let newDisposers: Disposer[] = [];
//       indexedItem.e = indexedItem.s = undefined;

//       const rightIndex = findIndexOfNodesToRight(indexedItems, key);
//       if (rightIndex < 0) {
//         renderInto(null, indexedAppend, newValue, {
//           ...context,
//           addDisposer: newDisposers.push.bind(newDisposers),
//         });
//       } else {
//         const rightNode = indexedItems[rightIndex]!.s!;
//         innerIndexedAppend = rightNode.before.bind(rightNode);
//         renderInto(null, indexedAppend, newValue, {
//           ...context,
//           addDisposer: newDisposers.push.bind(newDisposers),
//         });
//         innerIndexedAppend = append;
//       }
//     }

//     if (oldStart !== undefined) {
//       removeUntil(oldStart, oldEnd);
//     }

//     indexedItem = EMPTY_ITEM;
//   }

//   function handleAppend({ oldSize, size }: AtomListEmitAppend['data']) {
//     // const newValues = rawList.toArraySlice(oldSize);

//     indexedItems.length = size;

//     // for (let i = oldSize, ni = 0; i < size; i++, ni++) {
//     //   renderValueToIndex(newValues[ni], i);
//     // }
//     rawList.forEachInRange(renderValueToIndex, oldSize);

//     indexedItem = EMPTY_ITEM;
//   }

//   function handleReverse() {
//     indexedItems.reverse();

//     for (const item of indexedItems) {
//       if (item.s !== undefined) {
//         appendRange(item);
//       }
//     }
//   }

//   function handleSort({ sortMap, size }: AtomListEmitSort['data']) {
//     const oldIndexedItems = indexedItems;
//     indexedItems = new Array(oldIndexedItems.length);

//     for (let index = 0; index < size; index++) {
//       const mappedIndex = sortMap[index]!;
//       indexedItems[index] = oldIndexedItems[mappedIndex]!;
//     }

//     for (const item of indexedItems) {
//       if (item.s !== undefined) {
//         appendRange(item);
//       }
//     }
//   }

//   function handleSplice({
//     start,
//     deleteCount,
//     addCount,
//     oldSize,
//     size,
//   }: AtomListEmitSplice['data']) {
//     if (deleteCount === oldSize && start === 0) {
//       // Fast path for whole list replacement
//       const oldIndexedItems = indexedItems;
//       indexedItems = new Array(size);
//       scheduleCleanup(() => disposeIndexed(oldIndexedItems));

//       clearNodes();

//       rawList.forEach(renderValueToIndex);

//       indexedItem = EMPTY_ITEM;
//       return;
//     }

//     let deletedIndexedItems: IndexedItems;

//     if (addCount === 0) {
//       deletedIndexedItems = indexedItems.splice(start, deleteCount);
//     } else {
//       const savedIndexedItems = indexedItems;
//       indexedItems = new Array(addCount);
//       // TODO: replace with forEachInRange
//       const newValues = rawList.toArraySlice(start, start + addCount);

//       const rightIndex = findIndexOfNodesToRight(indexedItems, start);
//       if (rightIndex < 0) {
//         for (let i = 0; i < addCount; i++) {
//           renderValueToIndex(newValues[i], i);
//         }
//       } else {
//         const rightNode = indexedItems[rightIndex]!.s!;
//         innerIndexedAppend = rightNode.before.bind(rightNode);
//         for (let i = 0; i < newValues.length; i++) {
//           renderValueToIndex(newValues[i], i);
//         }
//         innerIndexedAppend = append;
//       }
//       indexedItem = EMPTY_ITEM;

//       deletedIndexedItems = savedIndexedItems.splice(
//         start,
//         deleteCount,
//         ...indexedItems
//       );
//       indexedItems = savedIndexedItems;
//     }

//     if (deletedIndexedItems.length > 0) {
//       scheduleCleanup(() => disposeIndexed(deletedIndexedItems));
//     }

//     for (const { s, e } of deletedIndexedItems) {
//       if (s !== undefined) {
//         removeUntil(s, e);
//       }
//     }
//   }

//   const listEmitDisposer = list.subscribe((message) => {
//     switch (message.type) {
//       case COLLECTION_MESSAGE_TYPE_CLEAR: {
//         return handleClear();
//       }
//       case COLLECTION_MESSAGE_TYPE_KEY_ADD: {
//         return handleAdd(message.data);
//       }
//       case COLLECTION_MESSAGE_TYPE_KEY_DELETE: {
//         return handleDelete(message.data);
//       }
//       case COLLECTION_MESSAGE_TYPE_KEY_SWAP: {
//         return handleSwap(message.data);
//       }
//       case COLLECTION_MESSAGE_TYPE_KEY_WRITE: {
//         return handleWrite(message.data);
//       }
//       case LIST_MESSAGE_TYPE_APPEND: {
//         return handleAppend(message.data);
//       }
//       case LIST_MESSAGE_TYPE_SPLICE: {
//         return handleSplice(message.data);
//       }
//       case LIST_MESSAGE_TYPE_REVERSE:
//         return handleReverse();
//       case LIST_MESSAGE_TYPE_SORT:
//         return handleSort(message.data);
//       default: {
//         throw new Error('Unhandled emit', { cause: message });
//       }
//     }
//   });

//   context.addDisposer(() => {
//     listEmitDisposer();
//     disposeIndexed(indexedItems);
//   });
// }

// // function wrapInScheduleRender<TData>(cb: (data: TData) => void) {
// //   return (data: TData) => {
// //     animationFrameScheduler(() => cb(data));
// //   };
// // }

// function disposeIndexed(indexedItems: IndexedItems) {
//   for (const item of indexedItems) {
//     for (const d of item.d) {
//       d();
//     }
//   }
// }

// function findIndexOfNodesToRight(
//   indexedNodes: IndexedItems,
//   index: number
// ): number {
//   for (let i = index + 1; i < indexedNodes.length; i++) {
//     const node = indexedNodes[i]!.s;
//     if (node !== undefined) {
//       return i;
//     }
//   }
//   return -1;
// }
