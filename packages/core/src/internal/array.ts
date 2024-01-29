export function moveRight(
  array: unknown[],
  from: number,
  to: number,
  count: number
) {
  // TODO: use copyWithin instead of splice
  const items = array.splice(from, count);
  array.splice(to, 0, ...items);
}

export function moveLeft(
  array: unknown[],
  from: number,
  to: number,
  count: number
) {
  // TODO: use copyWithin instead of splice
  const items = array.splice(from, count);
  array.splice(to, 0, ...items);
}
