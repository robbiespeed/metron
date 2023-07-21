import {
  createStaticComponent,
  nodeBrandKey,
  type JSXContextProviderNode,
  type StaticComponent,
} from 'metron-jsx/node.js';

export interface TargetedEvent<TEventTarget extends EventTarget> extends Event {
  currentTarget: TEventTarget;
}

export interface EventHandler<TEventTarget extends EventTarget> {
  (this: void, event: TargetedEvent<TEventTarget>): void;
}

export interface DataEventHandler<
  TEventTarget extends EventTarget,
  TData = unknown
> {
  handler(this: void, data: TData, event: TargetedEvent<TEventTarget>): void;
  data: TData;
}

// export interface DelegatedEventRegister {
//   (type: string, target: EventTarget, handler: EventHandler<any>): void;
// }

// export interface DelegatedDataEventRegister {
//   (type: string, target: EventTarget, handler: DataEventHandler<any>): void;
// }

declare module '../context.js' {
  interface JSXContextStore {
    [eventDelegatorContextKey]: true;
    [dataEventDelegatorContextKey]: true;
  }
}

export const eventDelegatorContextKey = Symbol('Event Delegator');
export const dataEventDelegatorContextKey = Symbol('Data Event Delegator');

export const DATA_EVENT_KEY_PREFIX = '__METRON_EVENT_DATA';
export const EVENT_KEY_PREFIX = '__METRON_EVENT';

export interface DelegatedEventTarget extends EventTarget {
  [
    eventData: `${typeof DATA_EVENT_KEY_PREFIX}:${string}`
  ]: DataEventHandler<EventTarget>;
  [
    eventHandler: `${typeof EVENT_KEY_PREFIX}:${string}`
  ]: EventHandler<EventTarget>;
}

const stopPropagation = Event.prototype.stopPropagation;
const stopImmediatePropagation = Event.prototype.stopImmediatePropagation;

interface EventDelegationOptions {
  capture?: boolean;
  passive?: boolean;
}

export function createEventDelegator(
  types: string[],
  eventOptions: EventDelegationOptions | undefined = { passive: true }
): [
  init: (delegationRoot: EventTarget) => void,
  provider: StaticComponent<{ children: unknown }, JSXContextProviderNode>
] {
  function init(root: EventTarget) {
    for (const type of types) {
      const eventKey = `${EVENT_KEY_PREFIX}:${type}` as const;
      const dataEventKey = `${DATA_EVENT_KEY_PREFIX}:${type}` as const;

      function rootListener(evt: Event) {
        let node: EventTarget | null = evt.target;

        Object.defineProperty(evt, 'currentTarget', {
          configurable: true,
          get() {
            return node ?? root;
          },
        });

        let isStopped = false;

        Object.defineProperty(evt, 'stopPropagation', {
          configurable: true,
          get() {
            return function () {
              isStopped = true;
              stopPropagation.call(evt);
            };
          },
        });
        Object.defineProperty(evt, 'stopImmediatePropagation', {
          configurable: true,
          get() {
            return function () {
              isStopped = true;
              stopImmediatePropagation.call(evt);
            };
          },
        });

        while (node !== null) {
          const dataEventHandler = (node as DelegatedEventTarget)[dataEventKey];
          if (dataEventHandler !== undefined) {
            dataEventHandler.handler(dataEventHandler.data, evt as any);
          } else {
            const eventHandler = (node as DelegatedEventTarget)[eventKey];
            if (eventHandler !== undefined) {
              eventHandler(evt as any);
            }
          }

          node =
            node === root || isStopped
              ? null
              : ((node as ChildNode).parentNode as EventTarget | null);
        }
      }

      root.addEventListener(type, rootListener, eventOptions);
    }
  }

  return [
    init,
    createStaticComponent(({ children }) => ({
      [nodeBrandKey]: true,
      nodeType: 'ContextProvider',
      assignments: {
        [eventDelegatorContextKey]: true,
        [dataEventDelegatorContextKey]: true,
      },
      children,
    })),
  ];
}

// export function setupEventDelegator(type: string) {
//   const key = `${EVENT_KEY_PREFIX}:${type}` as const;
//   const rootListener = (evt: Event) => {
//     const rootNode = evt.currentTarget;
//     let node: EventTarget | null = evt.target;

//     Object.defineProperty(evt, 'currentTarget', {
//       configurable: true,
//       get() {
//         return node ?? rootNode;
//       },
//     });

//     const stopPropagation = evt.stopPropagation;
//     const stopImPropagation = evt.stopImmediatePropagation;

//     let isStopped = false;

//     Object.defineProperty(evt, 'stopPropagation', {
//       configurable: true,
//       get() {
//         return function () {
//           isStopped = true;
//           stopPropagation.call(evt);
//         };
//       },
//     });
//     Object.defineProperty(evt, 'stopImmediatePropagation', {
//       configurable: true,
//       get() {
//         return function () {
//           isStopped = true;
//           stopImPropagation.call(evt);
//         };
//       },
//     });

//     while (node !== null) {
//       const handler = (node as DelegatedEventTarget)[key];
//       if (handler !== undefined) {
//         if (EVENT_DATA_KEY in handler) {
//           handler(handler[EVENT_DATA_KEY], evt);
//         } else {
//           handler(evt);
//         }
//       }

//       node =
//         node === rootNode || isStopped
//           ? null
//           : ((node as ChildNode).parentNode as EventTarget | null);
//     }
//   };

//   return (element: EventTarget) => {
//     element.addEventListener(type, rootListener);
//   };
// }

// export function linkEvent<
//   TData = unknown,
//   TEventTarget extends EventTarget = EventTarget
// >(
//   data: TData,
//   handler: (data: TData, event: TargetedEvent<TEventTarget>) => void
// ): DataEventHandler<TEventTarget, TData> {
//   assertOverride<DataEventHandler<TEventTarget, TData>>(handler);
//   handler[EVENT_DATA_KEY] = data;
//   return handler;
// }
