// TODO: separate into properly named files
export function isIterable(value: unknown): value is Iterable<unknown> {
  return (value as any)?.[Symbol.iterator] !== undefined;
}

export type Writable<T> = {
  -readonly [P in keyof T]: T[P];
};

export type WritableDeep<T> = T extends object
  ? {
      -readonly [P in keyof T]: WritableDeep<T[P]>;
    }
  : T;
