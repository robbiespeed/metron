// import {
//   createAsyncReactiveContext,
//   type AsyncReactiveContext,
// } from './reactive-context.js';
// import { scheduleCleanup } from './schedulers.js';
// import { SignalNode } from './signal-node.js';

// function effectIntercept(this: SignalNode<unknown, Effect>) {
//   const meta = this.meta;
//   if (meta.canSchedule) {
//     meta.canSchedule = false;
//     scheduled.push(meta);
//   }
//   return false;
// }

// export class Effect {
//   node = new SignalNode<unknown, Effect>(this, effectIntercept);
//   comp: () => void;
//   canSchedule = false;
//   constructor(comp: () => void) {
//     this.node.initAsConsumer();
//     this.comp = comp;
//     strongEffects.add(this);
//     scheduled.push(this);
//   }
//   run() {
//     let prevCtx = ctxConnect;
//     ctxConnect = this.node;

//     this.comp();

//     ctxConnect = prevCtx;

//     this.canSchedule = true;
//   }
//   dispose() {
//     strongEffects.delete(this);
//     this.canSchedule = false;
//   }
// }

// export function createReactor(
//   reaction: (context: AsyncReactiveContext) => void,
//   signalScheduler?: (callback: () => void) => void
// ) {
//   let canScheduleStabilize = true;

//   let context: AsyncReactiveContext;
//   const innerRun = () => {
//     context.done();
//     context = createAsyncReactiveContext(connectToParent);

//     reaction(context);
//     if (canScheduleStabilize) {
//       canScheduleStabilize = false;
//       scheduleCleanup(stabilize);
//     }
//   };

//   const run = signalScheduler ? () => signalScheduler(innerRun) : innerRun;

//   const { connectToParent, stabilize, clear } = new SignalNode(run);
//   context = createAsyncReactiveContext(connectToParent);
//   run();

//   return () => {
//     context.done();
//     clear();
//   };
// }
