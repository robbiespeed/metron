import { createEmitter, type Emitter } from './emitter.js';

export function filterEmitter<T, O extends T>(
  baseEmitter: Emitter<T>,
  filter: (data: T) => data is O
): Emitter<O>;
export function filterEmitter<T>(
  baseEmitter: Emitter<T>,
  filter: (data: T) => boolean
): Emitter<T>;
export function filterEmitter<T>(
  baseEmitter: Emitter<T>,
  filter: (data: T) => boolean
): Emitter<T> {
  const [emitter, send] = createEmitter<T>();

  baseEmitter((data: T) => {
    if (filter(data)) {
      send(data);
    }
  });

  return emitter;
}
