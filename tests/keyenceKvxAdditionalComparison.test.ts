import test from 'node:test';
import assert from 'node:assert/strict';
import { parseKeyenceMnm } from '../src/keyence/parser.ts';
import { compareKeyencePrograms, keyenceComparisonDrawings } from '../src/keyence/comparison.ts';
import { keyenceStChangedLines } from '../src/keyence/structuredText.ts';
import { keyenceInstructionCopyText } from '../src/keyence/instructionCopy.ts';
import { projectKeyenceInstruction } from '../src/keyence/compareDrawing.tsx';
import { blockRangeText } from '../src/blockRangeCopy.ts';

// Independent synthetic circuits, unrelated to supplied program data.
const parse = (lines: string[]) =>
  parseKeyenceMnm(
    new TextEncoder().encode(['DEVICE:60', ...lines].join('\n')).buffer,
    'dummy-extra.mnm',
  );
const prefix = ['LD MR83', 'BOX_ST', ';DummyTotal := 6;', ';DummyValid := TRUE;'];
const tail = ['LD MR84', 'OUT MR85'];

test('a BOX_ST edit highlights its source change without changing surrounding conditions or wires', () => {
  const a = parse([...prefix, ...tail]),
    b = parse(['LD MR83', 'BOX_ST', ';DummyTotal := 9;', ';DummyValid := TRUE;', ...tail]);
  const comparison = compareKeyencePrograms(a, b);
  assert.equal(comparison.changes.length, 1);
  const change = comparison.changes[0];
  assert.equal(change.source?.opcode, 'BOX_ST');
  assert.deepEqual([...keyenceStChangedLines(change.source!)], [4]);
  assert.equal(
    keyenceInstructionCopyText(change.source!, a),
    'DummyTotal := 6;\r\nDummyValid := TRUE;',
  );
  assert.equal(blockRangeText([{ instructions: [change.source!] }]), '元ファイル 3～5行');
  assert.equal(projectKeyenceInstruction(change.source!, a).op, 'BOX_ST');
  for (const mode of ['wrap', 'scroll'] as const)
    for (const g of keyenceComparisonDrawings(comparison, true, mode))
      for (const d of [...g.source, ...g.target]) {
        assert.ok(Number.isFinite(d.height));
        assert.equal(d.st, undefined, 'BOX_ST remains part of the ladder');
        assert.ok(d.wires.every((w) => !w.difference));
        assert.ok(d.symbols.every((s) => !s.inputDifference && !s.outputDifference));
      }
});

test('disabling a circuit changes its execution state without marking the following circuit', () => {
  const a = parse([...prefix, ...tail]),
    b = parse(['DISABLED_RUNG', ...prefix, 'END_DISABLED_RUNG', ...tail]);
  const comparison = compareKeyencePrograms(a, b);
  for (const opcode of ['LD', 'BOX_ST']) {
    const instruction = comparison.target.instructions.find((i) => i.opcode === opcode)!;
    assert.equal(instruction.disabled, true);
    assert.equal(instruction.difference?.kind, 'changed');
  }
  assert.ok(
    comparison.target.instructions
      .filter((i) => i.operands.includes('MR84') || i.operands.includes('MR85'))
      .every((i) => !i.difference && !i.disabled),
  );
  for (const mode of ['wrap', 'scroll'] as const)
    for (const g of keyenceComparisonDrawings(comparison, true, mode))
      for (const d of [...g.source, ...g.target]) {
        assert.ok(
          [d.height, d.headerHeight, ...d.symbols.flatMap((s) => [s.x, s.y])].every(
            Number.isFinite,
          ),
        );
        assert.ok(d.symbols.every((s) => !s.instruction.opcode.includes('DISABLED_RUNG')));
      }
  assert.deepEqual(compareKeyencePrograms(b, b).changes, []);
});
