// Layouts must be ordered and non-overlapping; the returned end is exclusive.
export function visibleRange(
  count: number,
  at: (index: number) => { top: number; height: number },
  start: number,
  end: number,
): [number, number] {
  let low = 0,
    high = count;
  while (low < high) {
    const mid = (low + high) >>> 1,
      item = at(mid);
    if (item.top + item.height <= start) low = mid + 1;
    else high = mid;
  }
  const first = low;
  high = count;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (at(mid).top < end) low = mid + 1;
    else high = mid;
  }
  return [first, Math.max(first, low)];
}
