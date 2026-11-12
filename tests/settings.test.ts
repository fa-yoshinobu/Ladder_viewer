import test from 'node:test';
import assert from 'node:assert/strict';
import { readSetting } from '../src/settings';

test('saved settings validate values and retain existing preference keys', (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map([
    ['theme', 'dark'],
    ['stHighlight', 'true'],
    ['showComments', 'false'],
    ['viewMode', 'scroll'],
    ['ladderPalette-light', 'blue'],
  ]);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (key: string) => values.get(key) ?? null },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  assert.equal(readSetting('theme'), 'dark');
  assert.equal(readSetting('stHighlight'), true);
  assert.equal(readSetting('showComments'), false);
  assert.equal(readSetting('viewMode'), 'scroll');
  assert.equal(readSetting('ladderPalette-light'), 'blue');
  values.set('theme', 'invalid');
  values.set('viewMode', 'invalid');
  values.set('showComments', 'invalid');
  assert.equal(readSetting('theme'), 'light');
  assert.equal(readSetting('viewMode'), 'wrap');
  assert.equal(readSetting('showComments'), true);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('storage disabled');
    },
  });
  assert.equal(readSetting('viewMode'), 'wrap');
});
