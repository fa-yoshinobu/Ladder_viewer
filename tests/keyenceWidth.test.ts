import { requireValue } from '../src/requireValue';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseKeyenceMnm } from '../src/keyence/parser.ts';
import { buildKeyenceNetworks } from '../src/keyence/logic.ts';
import { layoutKeyenceNetwork, keyenceViewDrawing } from '../src/keyence/layout.ts';
import { keyenceOutputStyle, keyenceBoxColumnSpans } from '../src/keyence/outputStyle.ts';
import { KeyenceNativeSymbol } from '../src/keyence/nativeSymbols.tsx';
import { compareKeyencePrograms, keyenceComparisonDrawings } from '../src/keyence/comparison.ts';
import { strokeCoordinates } from '../src/drawing.ts';
import { CELL } from '../src/ladderMetrics.ts';

// Synthetic labels and values are independent of all supplied reference programs.
const program = (lines: string[]) =>
  parseKeyenceMnm(
    new TextEncoder().encode(['DEVICE:99', ...lines].join('\n')).buffer,
    'synthetic-width.mnm',
  );
const drawing = (lines: string[]) => {
  const p = program(lines);
  return layoutKeyenceNetwork(requireValue(buildKeyenceNetworks(p)[0]), p, false);
};
const last = (lines: string[]) => drawing(lines).symbols.at(-1)!;
function nodes(value: any): any[] {
  if (value == null || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (typeof value.type === 'function') return nodes(value.type(value.props));
  return [value, ...nodes(value.props?.children)];
}

test('stacked native comparisons and calculations keep short labels within one cell', () => {
  for (const command of [
    'LD=.S DM8300 DM8301',
    'BLD.D DM8302 #9',
    'LDWK MR8303',
    'STG MR8304',
    'LD=.A DummyValue1 DummyValue2',
    'LDCAL "27/02/03" "27/04/05"',
  ]) {
    const d = drawing([command, 'OUT MR8399']);
    assert.equal(requireValue(d.symbols[0]).width, CELL, command);
  }
  for (const command of ['DFLOAT.D', 'DROUND.S'])
    assert.equal(last(['LD R8300', command]).width, CELL, command);
  const long = drawing(['LD= VeryLongSyntheticRegisterName #42', 'OUT MR8399']);
  assert.ok(
    requireValue(long.symbols[0]).width > CELL,
    'a label that cannot fit still gets enough space',
  );
  assert.equal(
    requireValue(long.symbols[0]).instruction.operands[0],
    'VeryLongSyntheticRegisterName',
  );
});

test('native commands expand only the column containing a long field', () => {
  assert.equal(last(['LD R8400', 'MOV MR8400:Z9 DM8401']).width, 2 * CELL);
  const s = last(['LD R8400', 'MOV VeryLongSyntheticRegisterName DM8401']);
  const spans = keyenceBoxColumnSpans(keyenceOutputStyle(s.instruction));
  assert.deepEqual(spans, [3, 1]);
  assert.equal(s.width, 4 * CELL);
  const parts = nodes(KeyenceNativeSymbol({ symbol: s, c: strokeCoordinates(1, 1, 0, 0) }));
  const fields = parts.filter(
    (n) => n.type === 'text' && n.props.class === 'device kv-native-operand',
  );
  assert.equal(fields[0].props.x, s.x + 1.5 * CELL);
  assert.equal(fields[1].props.x, s.x + 3.5 * CELL);
  const secondRow = last([
    'LD R8400',
    'MWRIT DM8401 DM8402 DM8403 VeryLongSyntheticRegisterName DM8404',
  ]);
  assert.deepEqual(keyenceBoxColumnSpans(keyenceOutputStyle(secondRow.instruction)), [3, 1, 1]);
});

test('MCALL uses one three-cell frame and only grows for a name beyond its available space', () => {
  const s = last(['LD R8500', 'MCALL DummyMacroCall']);
  assert.equal(s.width, 3 * CELL);
  const parts = nodes(KeyenceNativeSymbol({ symbol: s, c: strokeCoordinates(1, 1, 0, 0) }));
  assert.equal(parts.filter((n) => n.type === 'rect').length, 1);
  assert.equal(
    parts.filter((n) => n.type === 'line' && n.props.x1 === n.props.x2).length,
    0,
    'macro frame has no internal dividers',
  );
  const fields = parts.filter((n) => n.type === 'text');
  assert.equal(fields[0].props.y, fields[1].props.y);
  assert.ok(fields[1].props.x > fields[0].props.x);
  assert.ok(last(['LD R8500', 'MCALL VeryLongSyntheticMacroNameBeyondTwoCells']).width > 3 * CELL);
});

test('shorter comparisons avoid unnecessary wrapping while long fields wrap without changing connections', () => {
  const short = [
    'LD= DM8600 #1',
    ...Array.from({ length: 8 }, (_, i) => `AND= DM${8601 + i} #1`),
    'OUT MR8699',
  ];
  const d = drawing(short);
  assert.equal(keyenceViewDrawing(d, 'wrap'), d);
  const source = program(['LD= DM8600 #1', 'MOV DM8601 DM8602']);
  const target = program([
    'LD= VeryLongSyntheticRegisterName #1',
    'MOV DM8601 VeryLongSyntheticDestination',
  ]);
  const comparison = compareKeyencePrograms(source, target);
  for (const mode of ['wrap', 'scroll'] as const)
    for (const group of keyenceComparisonDrawings(comparison, false, mode))
      for (const d of [...group.source, ...group.target]) {
        assert.ok(d.wires.every((w) => !w.difference));
        assert.ok(d.symbols.every((s) => !s.inputDifference && !s.outputDifference));
        assert.ok(d.symbols.every((s) => s.x >= d.left && s.x + s.width <= d.right - 8));
      }
  const wide = drawing([
    'LD R8600',
    ...Array.from({ length: 11 }, (_, i) => `AND R${8601 + i}`),
    'MOV VeryLongSyntheticRegisterName DM8620',
  ]);
  const wrapped = keyenceViewDrawing(wide, 'wrap');
  assert.equal(wrapped.symbols.length, wide.symbols.length);
  assert.ok(
    wrapped.symbols.every((s) => s.x >= wrapped.left && s.x + s.width <= wrapped.right - 8),
  );
});
