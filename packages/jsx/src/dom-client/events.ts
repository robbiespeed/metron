import { run } from './runtime.js';

export interface TargetedEvent<TEventTarget extends EventTarget> extends Event {
  currentTarget: TEventTarget;
}

export interface DelegatedEvent<TEventTarget extends EventTarget>
  extends TargetedEvent<TEventTarget> {
  stopDelegatedPropagation(): void;
}

export interface EventHandler<TEventTarget extends EventTarget> {
  (this: void, event: TargetedEvent<TEventTarget>): void;
}

export interface DelegatedEventHandler<
  TData,
  TEventTarget extends EventTarget
> {
  (this: void, data: TData, event: TargetedEvent<TEventTarget>): void;
}

export type DelegatedEventParams<TData, TEventTarget extends EventTarget> = {
  data: TData;
  handler: DelegatedEventHandler<TData, TEventTarget>;
};

export const EVENT_DATA_KEY_PREFIX = '__METRON_EVENT_DATA';
export const EVENT_KEY_PREFIX = '__METRON_EVENT';

export interface DelegatedEventTarget extends EventTarget {
  [eventData: `${typeof EVENT_DATA_KEY_PREFIX}:${string}`]: unknown;
  [eventHandler: `${typeof EVENT_KEY_PREFIX}:${string}`]: DelegatedEventHandler<
    unknown,
    EventTarget
  >;
}

interface EventDelegationOptions {
  passive?: boolean;
}

export function createEventDelegator(
  types: string[],
  eventOptions: EventDelegationOptions | undefined = { passive: true }
): (delegationRoot: EventTarget) => void {
  return function init(root: EventTarget) {
    // TODO: Dev mode only
    // const eventTypeDictionary: Record<string, true> = {};

    for (const type of types) {
      // TODO: Dev mode only
      // eventTypeDictionary[type] = true;

      const eventKey = `${EVENT_KEY_PREFIX}:${type}` as const;
      const eventDataKey = `${EVENT_DATA_KEY_PREFIX}:${type}` as const;

      function rootListener(evt: Event) {
        let node: EventTarget | null = evt.target;

        Object.defineProperty(evt, 'currentTarget', {
          configurable: true,
          get() {
            return node ?? root;
          },
        });

        let isStopped = false;

        (evt as DelegatedEvent<any>).stopDelegatedPropagation = () => {
          isStopped = true;
        };

        do {
          const eventHandler = (node as DelegatedEventTarget)[eventKey];
          if (eventHandler !== undefined) {
            eventHandler(
              (node as DelegatedEventTarget)[eventDataKey],
              evt as any
            );
            if (isStopped) {
              return;
            }
          }

          node = (node as ChildNode).parentNode as EventTarget | null;
        } while (node !== null && node !== root);
      }

      root.addEventListener(
        type,
        runtimeEventListener.bind(rootListener),
        eventOptions
      );
    }

    // TODO: Dev mode only
    // root.__METRON_DEV_DELEGATED_TYPES = eventTypeDictionary;
  };
}

export function runtimeEventListener(this: EventListener, event: Event) {
  this(event);
  run();
}
