// TODO: separate into properly named files
export function isIterable(value: {}): value is Iterable<unknown> {
  return (
    (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] !== undefined
  );
}

export type Writable<T> = {
  -readonly [P in keyof T]: T[P];
};

export type WritableDeep<T> = T extends object
  ? {
      -readonly [P in keyof T]: WritableDeep<T[P]>;
    }
  : T;

export function assertOverride<T>(value: unknown): asserts value is T {}
