// import { signalKey, type Atom, toValueKey } from './particle.js';
// import { scheduleCleanup } from './schedulers.js';
// import { SignalNode } from './signal-node.js';

// export interface Selector<T> {
//   (match: T): Atom<boolean>;
//   <U>(match: T, deriver: (isSelected: boolean) => U): Atom<U>;
// }

// interface FinalizerHeldItem {
//   targetRef: WeakRef<SignalNode<void>>;
//   refMap: Map<unknown, WeakRef<SignalNode<void>>>;
//   match: unknown;
// }

// const finalizationRegistry = new FinalizationRegistry(
//   ({ refMap, match }: FinalizerHeldItem) => {
//     refMap.delete(match);
//   }
// );

// const finalizerStack: FinalizerHeldItem[] = [];

// let canScheduleAddFinalizers = true;

// function addFinalizers() {
//   for (const item of finalizerStack) {
//     const target = item.targetRef.deref();
//     if (target) {
//       finalizationRegistry.register(target, item);
//     }
//   }
//   canScheduleAddFinalizers = true;
// }

// export function createSelector<T>(
//   initial: T
// ): [Selector<T>, (value: T) => void] {
//   const refMap = new Map<T, WeakRef<SignalNode<void>>>();

//   let storedValue = initial;

//   function set(value: T): void {
//     if (storedValue === value) {
//       return;
//     }
//     const oldValue = storedValue;
//     storedValue = value;
//     refMap.get(oldValue)?.deref()?.update();
//     refMap.get(storedValue)?.deref()?.update();
//   }

//   function selector<U>(
//     match: T,
//     deriver?: (isSelected: boolean) => U
//   ): Atom<unknown> {
//     let matchEmitter = refMap.get(match)?.deref();

//     if (matchEmitter === undefined) {
//       const signalNode = new SignalNode<void>(undefined);
//       signalNode.initAsSource();
//       matchEmitter = signalNode;

//       const targetRef = signalNode.weakRef;

//       refMap.set(match, targetRef);

//       finalizerStack.push({ refMap, match, targetRef });
//       if (canScheduleAddFinalizers) {
//         scheduleCleanup(addFinalizers);
//       }
//     }

//     return deriver
//       ? {
//           [toValueKey]() {
//             return deriver(storedValue === match);
//           },
//           [signalKey]: matchEmitter,
//         }
//       : {
//           [toValueKey]() {
//             return storedValue === match;
//           },
//           [signalKey]: matchEmitter,
//         };
//   }

//   return [selector as Selector<T>, set];
// }
