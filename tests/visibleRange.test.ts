import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleRange } from '../src/visibleRange';

test('5,000 variable-height circuits match a full scan with logarithmic lookups', () => {
  let top = 8;
  const layouts = Array.from({ length: 5000 }, (_, index) => {
    const item = { top, height: 40 + (index % 7) * 20 };
    top += item.height;
    return item;
  });
  for (const start of [-400, 0, 70, 12345, top - 800, top, top + 500]) {
    let lookups = 0;
    const [first, end] = visibleRange(
      layouts.length,
      (index) => {
        lookups++;
        return layouts[index];
      },
      start,
      start + 800,
    );
    assert.deepEqual(
      layouts.slice(first, end),
      layouts.filter((item) => item.top + item.height > start && item.top < start + 800),
    );
    assert.ok(lookups <= 26, `lookups: ${lookups}`);
  }
});
test('visibility uses exclusive boundaries and supports empty data', () => {
  const at = (index: number) => ({ top: index * 100, height: 100 });
  assert.deepEqual(visibleRange(3, at, 100, 200), [1, 2]);
  assert.deepEqual(
    visibleRange(
      0,
      () => {
        throw new Error('must not read');
      },
      0,
      100,
    ),
    [0, 0],
  );
});
