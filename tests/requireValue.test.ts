import test from 'node:test';
import assert from 'node:assert/strict';
import { requireValue } from '../src/requireValue';

test('checked reads preserve values and reject missing indices', () => {
  const values = [0, false, '', null];
  for (let index = 0; index < values.length; index++)
    assert.equal(requireValue(values[index]), values[index]);
  assert.throws(() => requireValue(values[-1]), RangeError);
  assert.throws(() => requireValue(values[values.length]), RangeError);
});
