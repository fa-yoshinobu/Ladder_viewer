import test from 'node:test';
import assert from 'node:assert/strict';
import { stepZoom, clampZoom } from '../src/zoom.ts';

test('zoom buttons snap arbitrary fit values to the next ten-percent step', () => {
  for (const comparison of [false, true]) {
    assert.equal(stepZoom(0.87, 1, comparison), 0.9);
    assert.equal(stepZoom(0.87, -1, comparison), 0.8);
    assert.equal(stepZoom(0.9, 1, comparison), 1);
    assert.equal(stepZoom(0.9, -1, comparison), 0.8);
    assert.equal(stepZoom(1.5, 1, comparison), 1.5);
  }
  assert.equal(stepZoom(0.5, -1), 0.5);
  assert.equal(stepZoom(0.3, -1, true), 0.25);
  assert.equal(stepZoom(0.25, 1, true), 0.3);
  assert.equal(clampZoom(5), 1.5);
});
