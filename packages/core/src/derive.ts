// import type { Atom } from './atom.js';
// import { emptyCacheToken, type EmptyCacheToken } from './cache.js';
// import {
//   emitterKey,
//   toValueKey,
//   type MaybeAtomParticle,
//   type ExtractAtomArrayValues,
// } from './particle.js';
// import { SignalNode } from './signal-node.js';

// export interface DerivedAtom<T> extends Atom<T> {
//   readonly cachedValue: T | EmptyCacheToken;
// }

// export function derive<const D extends readonly MaybeAtomParticle[], T>(
//   dependencies: D,
//   run: (...values: ExtractAtomArrayValues<D>) => T
// ): DerivedAtom<T> {
//   let cachedValue: T | EmptyCacheToken = emptyCacheToken;
//   const emitter = new SignalNode((send) => {
//     if (cachedValue === emptyCacheToken) {
//       return;
//     }
//     cachedValue = emptyCacheToken;
//     send();
//   });

//   const { connectStaticToParent, stabilize } = emitter;

//   for (const particle of dependencies) {
//     connectStaticToParent(particle[emitterKey]);
//   }

//   function getValue() {
//     if (cachedValue === emptyCacheToken) {
//       const values = dependencies.map((atom) =>
//         atom[toValueKey]?.()
//       ) as ExtractAtomArrayValues<D>;
//       cachedValue = run.apply<undefined, ExtractAtomArrayValues<D>, T>(
//         undefined,
//         values
//       );
//       stabilize();
//     }
//     return cachedValue as T;
//   }

//   return {
//     get cachedValue() {
//       return cachedValue;
//     },
//     [toValueKey]: getValue,
//     [emitterKey]: emitter,
//   };
// }
