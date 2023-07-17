import type {
  EventHandler,
  TargetedEvent,
  DelegatedDataEventHandler,
} from './jsx.js';
import { assertOverride } from './shared.js';

export const EVENT_DATA_KEY = '__METRON_EVENT_DATA';
export const DELEGATED_EVENT_KEY_PREFIX = '__METRON_EVENT';

interface DelegatedEventTarget extends EventTarget {
  [eventHandler: `${typeof DELEGATED_EVENT_KEY_PREFIX}:${string}`]:
    | EventHandler<any>
    | DelegatedDataEventHandler<any>;
}

export function setupEventDelegator(type: string) {
  const key = `${DELEGATED_EVENT_KEY_PREFIX}:${type}` as const;
  const rootListener = (evt: Event) => {
    const rootNode = evt.currentTarget;
    let node: EventTarget | null = evt.target;

    Object.defineProperty(evt, 'currentTarget', {
      configurable: true,
      get() {
        return node ?? rootNode;
      },
    });

    const stopPropagation = evt.stopPropagation;
    const stopImPropagation = evt.stopImmediatePropagation;

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
          stopImPropagation.call(evt);
        };
      },
    });

    while (node !== null) {
      const handler = (node as DelegatedEventTarget)[key];
      if (handler !== undefined) {
        if (EVENT_DATA_KEY in handler) {
          handler(handler[EVENT_DATA_KEY], evt);
        } else {
          handler(evt);
        }
      }

      node =
        node === rootNode || isStopped
          ? null
          : ((node as ChildNode).parentNode as EventTarget | null);
    }
  };

  return (element: EventTarget) => {
    element.addEventListener(type, rootListener);
  };
}

export function linkEvent<
  TData = unknown,
  TEventTarget extends EventTarget = EventTarget
>(
  data: TData,
  handler: (data: TData, event: TargetedEvent<TEventTarget>) => void
): DelegatedDataEventHandler<TEventTarget, TData> {
  assertOverride<DelegatedDataEventHandler<TEventTarget, TData>>(handler);
  handler[EVENT_DATA_KEY] = data;
  return handler;
}
