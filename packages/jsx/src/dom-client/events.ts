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

export type DataEvent<TData, TEventTarget extends EventTarget> = {
  data: TData;
  handler: DelegatedEventHandler<TData, TEventTarget>;
};

export const EVENT_KEY_PREFIX = '__METRON_EVENT';

export type EventKey = `${typeof EVENT_KEY_PREFIX}:${string}`;

export interface DelegatedEventTarget extends EventTarget {
  [event: EventKey]:
    | EventHandler<EventTarget>
    | DataEvent<unknown, EventTarget>;
}

interface EventDelegationOptions {
  passive?: boolean;
}

function delegateListener(root: EventTarget, eventKey: EventKey, evt: Event) {
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

  for (
    ;
    node !== null && node !== root;
    node = (node as ChildNode).parentNode as EventTarget | null
  ) {
    const delegated = (node as DelegatedEventTarget)[eventKey];
    if (delegated !== undefined) {
      if (typeof delegated === 'object') {
        delegated.handler(delegated.data, evt as any);
      } else {
        delegated(evt as any);
      }
      if (isStopped) {
        return;
      }
    }
  }
}

export function createEventDelegator(
  types: string[],
  eventOptions: EventDelegationOptions | undefined
): (delegationRoot: EventTarget) => void {
  return function init(root: EventTarget) {
    // TODO: Dev mode only
    // const eventTypeDictionary: Record<string, true> = {};

    for (const type of types) {
      // TODO: Dev mode only
      // eventTypeDictionary[type] = true;

      const listener = delegateListener.bind(
        undefined,
        root,
        `${EVENT_KEY_PREFIX}:${type}`
      );

      root.addEventListener(type, listener, eventOptions);
    }

    // TODO: Dev mode only
    // root.__METRON_DEV_DELEGATED_TYPES = eventTypeDictionary;
  };
}
