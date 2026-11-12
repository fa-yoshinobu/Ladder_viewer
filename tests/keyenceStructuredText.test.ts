import { requireValue } from '../src/requireValue';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseKeyenceMnm } from '../src/keyence/parser.ts';
import { compareKeyencePrograms, keyenceComparisonDrawings } from '../src/keyence/comparison.ts';
import { keyenceInstructionCopyText } from '../src/keyence/instructionCopy.ts';
import { keyenceStChangedLines, keyenceStLayout } from '../src/keyence/structuredText.ts';
import { blockRangeText } from '../src/blockRangeCopy.ts';

// Original dummy source; no external program content is included.
const parse = (commands: string[]) =>
  parseKeyenceMnm(
    new TextEncoder().encode(['DEVICE:60', ...commands].join('\n')).buffer,
    'dummy.mnm',
  );
const st = (lines: string[]) =>
  parse(['AREA_ST', ...lines.map((line) => ';' + line), 'END', 'ENDH']);

test('ST preserves source whitespace for copying and includes its final source line in the block range', () => {
  const lines = ['IF DummyReady THEN', '\tDummyTotal := 31;', '', 'END_IF;'],
    p = st(lines),
    i = requireValue(p.instructions[0]);
  assert.equal(keyenceInstructionCopyText(i, p), lines.join('\r\n'));
  assert.equal(blockRangeText([{ instructions: [i] }]), '元ファイル 2～6行');
  assert.deepEqual(
    i.st!.lines.map((line) => line.sourceLine),
    [3, 4, 5, 6],
  );
});

test('ST wrapping retains all characters and source locations while scroll mode retains complete lines', () => {
  const lines = ['\tDummyText := ' + '仮の文字列'.repeat(60) + ';', '', 'DummyFlag := FALSE;'],
    i = requireValue(st(lines).instructions[0]);
  const wrapped = keyenceStLayout(i, true),
    scroll = keyenceStLayout(i, false);
  assert.ok(wrapped.rows.length > scroll.rows.length);
  assert.ok(scroll.width > wrapped.width);
  for (const line of i.st!.lines) {
    const fragments = wrapped.rows.filter((row) => row.sourceLine === line.sourceLine);
    assert.equal(fragments.map((row) => row.text).join(''), line.text.replace('\t', '    '));
    assert.equal(requireValue(fragments[0]).continuation, false);
    assert.ok(fragments.slice(1).every((row) => row.continuation));
  }
  assert.ok(wrapped.height > scroll.height);
  assert.ok(Number.isFinite(wrapped.height));
});

test('ST comparison highlights only changed or inserted source lines, with unchanged trailing commands preserved', () => {
  const a = st(['DummyA := 2;', '', 'DummyB := 3;', 'DummyC := 4;']);
  const b = st(['DummyA := 2;', '', 'DummyB := 9;', 'DummyInserted := TRUE;', 'DummyC := 4;']);
  const comparison = compareKeyencePrograms(a, b);
  assert.equal(comparison.changes.length, 1);
  const change = requireValue(comparison.changes[0]);
  assert.equal(change.kind, 'changed');
  assert.deepEqual([...keyenceStChangedLines(change.source!)], [5]);
  assert.deepEqual([...keyenceStChangedLines(change.target!)], [5, 6]);
  assert.ok(comparison.source.instructions.slice(1).every((i) => !i.difference));
  assert.ok(comparison.target.instructions.slice(1).every((i) => !i.difference));
  for (const mode of ['wrap', 'scroll'] as const) {
    const drawings = keyenceComparisonDrawings(comparison, false, mode).flatMap((group) => [
      ...group.source,
      ...group.target,
    ]);
    for (const d of drawings) {
      assert.ok(Number.isFinite(d.height));
      assert.ok(Number.isFinite(d.headerHeight));
    }
    const source = drawings.find((d) => d.st === change.source)!;
    assert.deepEqual(source.wires, []);
    assert.equal(source.stRows!.length, 4);
  }
});

test('identical ST and changed annotation-only networks keep finite comparison geometry', () => {
  const same = st(['DummyValue := 8;']);
  assert.deepEqual(compareKeyencePrograms(same, same).changes, []);
  const a = parse([
    'BOOKMARK "Dummy heading"',
    'RUNG_COMMENT "Dummy note"',
    'LD MR9',
    'OUT MR10',
    'END',
  ]);
  const b = parse([
    'BOOKMARK "Other heading"',
    'RUNG_COMMENT "Dummy note"',
    'LD MR9',
    'OUT MR10',
    'END',
  ]);
  const comparison = compareKeyencePrograms(a, b);
  assert.equal(comparison.changes.length, 1);
  for (const mode of ['wrap', 'scroll'] as const)
    for (const group of keyenceComparisonDrawings(comparison, false, mode)) {
      for (const d of [...group.source, ...group.target]) {
        assert.ok(Number.isFinite(d.height));
        assert.ok(Number.isFinite(d.headerHeight));
        if (d.rows === 0) {
          assert.deepEqual(d.symbols, []);
          assert.deepEqual(d.wires, []);
          assert.deepEqual(d.rails, []);
        }
      }
    }
});
