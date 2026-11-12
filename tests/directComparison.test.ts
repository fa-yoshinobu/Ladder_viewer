import { requireValue } from '../src/requireValue';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProgram } from '../src/model.ts';
import { parseKeyenceMnm } from '../src/keyence/parser.ts';
import { compareMitsubishiPrograms } from '../src/directMitsubishi.ts';
import { compareKeyencePrograms, keyenceComparisonDrawings } from '../src/keyence/comparison.ts';
import {
  directInputs,
  pairDirectPrograms,
  compareDirectPair,
  unchangedDirectPair,
} from '../src/directComparison.ts';
import { parseCsvBatch } from '../src/batch.ts';
import { decodeNativeCsvFiles } from '../src/nativeCsv.ts';
import { symbolDifferenceKind } from '../src/model.ts';
import { keyenceSymbolDifferenceKind } from '../src/keyence/logic.ts';
const bytes = (text: string) => new TextEncoder().encode(text).buffer;
const gx = (commands: string[], offset = 0) =>
  parseProgram(
    [
      'ステップ番号\t命令\tI/O(デバイス)',
      ...commands.flatMap((text, index) => {
        const [op, ...args] = text.split(' ');
        return [
          [String(index + offset), op, args[0] ?? ''],
          ...args.slice(1).map((arg) => ['', '', arg]),
        ].map((row) => row.join('\t'));
      }),
    ].join('\n'),
    'synthetic.csv',
  );
const kv = (commands: string[]) =>
  parseKeyenceMnm(bytes(['DEVICE:99', ...commands].join('\n')), 'synthetic.mnm');

test('direct comparisons retain the same contact when a leading condition is inserted or removed', () => {
  for (const reverse of [false, true]) {
    const original = ['LDI M6', 'ANI X100', 'AND X10F', 'OUT Y0'],
      reduced = ['LDI X100', 'AND X10F', 'OUT Y0'];
    const p = compareMitsubishiPrograms(
      gx(reverse ? reduced : original),
      gx(reverse ? original : reduced),
    );
    const a = p.instructions.find((i) => i.operands[0] === 'X100')!,
      b = p.comparison!.target.instructions.find((i) => i.operands[0] === 'X100')!;
    assert.equal(a.comparisonRow, b.comparisonRow);
    assert.equal(symbolDifferenceKind(a), undefined);
    assert.equal(symbolDifferenceKind(b), undefined);
    assert.equal(
      (reverse ? p.comparison!.target : p).instructions.find((i) => i.operands[0] === 'M6')!
        .difference?.kind,
      reverse ? 'added' : 'removed',
    );
    assert.equal(p.comparison!.changes.length, 2);
    const before = ['LDB MR6', 'ANB R100', 'AND R10', 'OUT MR0'],
      after = ['LDB R100', 'AND R10', 'OUT MR0'];
    const compared = compareKeyencePrograms(
      kv(reverse ? after : before),
      kv(reverse ? before : after),
    );
    const left = compared.source.instructions.find((i) => i.operands[0] === 'R100')!,
      right = compared.target.instructions.find((i) => i.operands[0] === 'R100')!;
    assert.equal(left.comparisonRow, right.comparisonRow);
    assert.equal(keyenceSymbolDifferenceKind(left), undefined);
    assert.equal(keyenceSymbolDifferenceKind(right), undefined);
    assert.equal(
      (reverse ? compared.target : compared.source).instructions.find(
        (i) => i.operands[0] === 'MR6',
      )!.difference?.kind,
      reverse ? 'added' : 'removed',
    );
    assert.equal(compared.changes.length, 2);
  }
});
test('direct Mitsubishi comparison ignores shifted steps and never mutates either input', () => {
  const source = gx(['LD X0', 'AND X1', 'OUT Y0', 'END']),
    target = gx(['LD X0', 'AND X1', 'OUT Y0', 'END'], 100),
    before = JSON.stringify([source, target]);
  const compared = compareMitsubishiPrograms(source, target);
  assert.equal(compared.comparison!.differentRows, 0);
  assert.ok(compared.comparison!.shiftedSteps > 0);
  assert.equal(JSON.stringify([source, target]), before);
  assert.ok(compared.instructions.every((i) => i.comparisonRow !== undefined && !i.difference));
});
test('an inserted Mitsubishi rung with the same prefix does not change the original rung', () => {
  const source = gx(['LD X0', 'AND X1', 'OUT Y0', 'LD X2', 'MOV K1 D0', 'END']);
  const target = gx([
    'LD X0',
    'AND X1',
    'OUT Y99',
    'LD X0',
    'AND X1',
    'OUT Y0',
    'LD X2',
    'MOV K2 D0',
    'END',
  ]);
  const compared = compareMitsubishiPrograms(source, target),
    changes = compared.comparison!.changes;
  assert.deepEqual(
    changes.map((c) => c.kind),
    ['added', 'added', 'added', 'changed'],
  );
  assert.equal(compared.instructions.find((i) => i.operands[0] === 'Y0')?.difference, undefined);
  assert.deepEqual(
    compared.instructions.find((i) => i.op === 'MOV')?.difference?.operandChanges,
    [0],
  );
  assert.deepEqual(
    compared.networks.find((n) => n.actions.some((a) => a.instruction.operands[0] === 'Y0'))
      ?.connectionDifferences?.wires,
    [],
  );
});
test('same opcode structure still pairs when every operand changes', () => {
  const result = compareMitsubishiPrograms(gx(['LD X0', 'OUT Y0']), gx(['LD X9', 'OUT Y9']));
  assert.deepEqual(
    result.comparison!.changes.map((c) => c.kind),
    ['changed', 'changed'],
  );
});
test('left and right Mitsubishi comments participate without changing command tokens', () => {
  const result = compareMitsubishiPrograms(
    gx(['LD X0', 'OUT Y0']),
    gx(['LD X0', 'OUT Y0']),
    { X0: 'before' },
    { X0: 'after' },
  );
  assert.equal(result.comparison!.differentRows, 1);
  assert.deepEqual(requireValue(result.instructions[0]).difference?.operandChanges, []);
  assert.equal(requireValue(result.instructions[0]).difference?.opChanged, false);
});
test('Keyence inserts use full-rung anchors and preserve original line identities', () => {
  const source = kv(['LD R0', 'AND R1', 'OUT MR0', 'LD R2', 'MOV #1 DM0', 'END']);
  const target = kv([
    'LD R0',
    'AND R1',
    'OUT MR99',
    'LD R0',
    'AND R1',
    'OUT MR0',
    'LD R2',
    'MOV #2 DM0',
    'END',
  ]);
  const before = JSON.stringify([source, target]),
    result = compareKeyencePrograms(source, target);
  assert.deepEqual(
    result.changes.map((c) => c.kind),
    ['added', 'added', 'added', 'changed'],
  );
  assert.equal(JSON.stringify([source, target]), before);
  assert.equal(requireValue(result.source.instructions[0]).sourceLine, 2);
  assert.equal(result.source.instructions.find((i) => i.opcode === 'OUT')?.difference, undefined);
  for (const mode of ['wrap', 'scroll'] as const) {
    const diagrams = keyenceComparisonDrawings(result, true, mode);
    assert.ok(
      diagrams.every((g) => [...g.source, ...g.target].every((d) => Number.isFinite(d.height))),
    );
  }
});
test('Keyence ANL to ORL changes terminal connectivity independently of drawing coordinates', () => {
  const result = compareKeyencePrograms(
    kv(['LD R0', 'LD R1', 'ANL', 'OUT MR0']),
    kv(['LD R0', 'LD R1', 'ORL', 'OUT MR0']),
  );
  assert.equal(result.changes.length, 1);
  for (const mode of ['wrap', 'scroll'] as const) {
    const blocks = keyenceComparisonDrawings(result, false, mode);
    assert.ok(
      blocks.some((b) =>
        b.source.some(
          (d) =>
            d.wires.some((w) => w.difference === 'removed') ||
            d.symbols.some((s) => s.outputDifference === 'removed'),
        ),
      ),
    );
    assert.ok(
      blocks.some((b) => b.target.some((d) => d.wires.some((w) => w.difference === 'added'))),
    );
  }
});
test('Keyence KEEP preserves its two inputs and operand-only changes leave its opcode unchanged', () => {
  const result = compareKeyencePrograms(
    kv(['LD R0', 'LD R1', 'KEEP MR0', 'END']),
    kv(['LD R0', 'LD R2', 'KEEP MR0', 'END']),
  );
  const blocks = keyenceComparisonDrawings(result, true, 'wrap');
  assert.equal(
    blocks
      .flatMap((b) => b.source)
      .flatMap((d) => d.symbols)
      .find((s) => s.kind === 'keep')?.ports?.length,
    2,
  );
  assert.equal(result.changes.length, 1);
  assert.equal(requireValue(result.changes[0]).source?.difference?.opChanged, false);
});
test('programs present only on one side remain deletions or additions', () => {
  const input = requireValue(
    directInputs(
      parseCsvBatch([{ name: 'only.mnm', bytes: bytes('DEVICE:99\nLD R0\nOUT MR0') }]),
    )[0],
  );
  const pair = requireValue(pairDirectPrograms([], [input])[0]),
    result = compareDirectPair(pair);
  assert.equal(result.format, 'keyence');
  if (result.format === 'keyence')
    assert.ok(result.comparison.changes.every((c) => c.kind === 'added'));
});
test('folder comparison uses relative paths even when the minimal display names differ', () => {
  const batch = (name: string, relativePath: string) =>
    parseCsvBatch([{ name, relativePath, bytes: bytes('DEVICE:99\nEND') }]);
  const source = directInputs(batch('MAIN.mnm', 'axis/MAIN.mnm')),
    target = directInputs(batch('axis/MAIN.mnm', 'axis/MAIN.mnm'));
  assert.equal(pairDirectPrograms(source, target).length, 1);
  assert.ok(requireValue(pairDirectPrograms(source, target)[0]).target);
  const other = directInputs(batch('MAIN.mnm', 'other/MAIN.mnm'));
  assert.equal(pairDirectPrograms(source, other).length, 2);
});
test('native relative identities contain no absolute folder path and invalid types are rejected', () => {
  const file = {
    name: 'MAIN.mnm',
    relativePath: 'nested/MAIN.mnm',
    folder: 'opaque',
    base64: Buffer.from('DEVICE:99\nEND').toString('base64'),
  };
  assert.equal(requireValue(decodeNativeCsvFiles([file])[0]).relativePath, 'nested/MAIN.mnm');
  assert.throws(() => decodeNativeCsvFiles([{ ...file, relativePath: 3 } as any]), /受信データ/);
});
test('different manufacturers are rejected instead of using another parser or renderer', () => {
  const source = directInputs(
    parseCsvBatch([
      { name: 'main.csv', bytes: bytes('ステップ番号\t命令\tI/O(デバイス)\n0\tOUT\tY0') },
    ]),
  )[0];
  const target = directInputs(
    parseCsvBatch([{ name: 'main.mnm', bytes: bytes('DEVICE:99\nOUT MR0') }]),
  )[0];
  assert.throws(
    () => compareDirectPair({ id: 'pair', label: 'pair', source, target }),
    /同じメーカー/,
  );
});

test('unchanged-program filtering ignores STEP shifts but includes used comments and missing files', () => {
  const left = {
    format: 'mitsubishi' as const,
    name: 'before.csv',
    program: gx(['LD X0', 'OUT Y0']),
    comments: { X0: 'same' },
  };
  const right = {
    format: 'mitsubishi' as const,
    name: 'after.csv',
    program: gx(['LD X0', 'OUT Y0'], 100),
    comments: { X0: 'same' },
  };
  const pair = { id: 'pair', label: 'pair', source: left, target: right };
  assert.equal(unchangedDirectPair(pair), true);
  assert.equal(
    unchangedDirectPair({ ...pair, target: { ...right, comments: { X0: 'changed' } } }),
    false,
  );
  assert.equal(unchangedDirectPair({ ...pair, target: undefined }), false);
  const a = { format: 'keyence' as const, name: 'a.mnm', program: kv(['LD R0', 'OUT MR0']) };
  const b = { format: 'keyence' as const, name: 'b.mnm', program: kv(['', 'LD R0', 'OUT MR0']) };
  assert.equal(unchangedDirectPair({ id: 'kv', label: 'kv', source: a, target: b }), true);
});

test('split and merged Keyence circuits retain both outputs and align their rows', () => {
  const separate = kv([
    ';first',
    'LD R0',
    'MOV #1 DM0',
    ';second',
    'LD R0',
    'AND R1',
    'MOV #2 DM1',
    'END',
  ]);
  const shared = kv([';first', 'LD R0', 'MPS', 'MOV #1 DM0', 'MPP', 'AND R1', 'MOV #2 DM1', 'END']);
  for (const [source, target] of [
    [separate, shared],
    [shared, separate],
  ]) {
    const compared = compareKeyencePrograms(requireValue(source), requireValue(target));
    for (const value of ['#1', '#2']) {
      const a = compared.source.instructions.find(
        (i) => i.opcode === 'MOV' && i.operands[0] === value,
      )!;
      const b = compared.target.instructions.find(
        (i) => i.opcode === 'MOV' && i.operands[0] === value,
      )!;
      assert.equal(a.comparisonRow, b.comparisonRow);
      assert.equal(a.difference, undefined);
      assert.equal(b.difference, undefined);
    }
    const drawings = keyenceComparisonDrawings(compared, true, 'scroll');
    const group = drawings.find((g) => g.source.length > 1 || g.target.length > 1)!;
    assert.ok(group);
    const locations = (side: typeof group.source) => {
      let top = 0;
      return side.flatMap((d) => {
        const symbols = d.symbols.map((s) => ({
          row: s.instruction.comparisonRow,
          y: top + s.y,
          op: s.instruction.opcode,
        }));
        top += d.height;
        return symbols;
      });
    };
    const a = locations(group.source),
      b = locations(group.target);
    for (const s of a.filter((s) => s.op === 'MOV'))
      assert.equal(s.y, b.find((t) => t.row === s.row)!.y);
  }
});

test('reordered Keyence branches never become a change between different retained MOV values', () => {
  const source = kv([
    'LD R0',
    'MPS',
    'MOV #10 DM0',
    'MRD',
    'MOV #20 DM0',
    'MRD',
    'MOV #30 DM0',
    'MPP',
    'MOV #99 DM0',
    'END',
  ]);
  const target = kv([
    'LD R0',
    'MPS',
    'MOV #99 DM0',
    'MRD',
    'MOV #10 DM0',
    'MRD',
    'MOV #20 DM0',
    'MPP',
    'MOV #30 DM0',
    'END',
  ]);
  const compared = compareKeyencePrograms(source, target);
  for (const value of ['#10', '#20', '#30']) {
    const a = compared.source.instructions.find(
      (i) => i.opcode === 'MOV' && i.operands[0] === value,
    )!;
    const b = compared.target.instructions.find(
      (i) => i.opcode === 'MOV' && i.operands[0] === value,
    )!;
    assert.equal(a.comparisonRow, b.comparisonRow);
    assert.equal(a.difference, undefined);
  }
  assert.ok(compared.changes.every((c) => c.kind !== 'changed'));
  assert.equal(
    compared.source.instructions.find((i) => i.opcode === 'MOV' && i.operands[0] === '#99')
      ?.difference?.kind,
    'removed',
  );
  assert.equal(
    compared.target.instructions.find((i) => i.opcode === 'MOV' && i.operands[0] === '#99')
      ?.difference?.kind,
    'added',
  );
});

test('Mitsubishi circuit merging retains outputs across the original circuit boundary', () => {
  const source = gx(['LD X0', 'OUT Y0', 'LD X0', 'AND X1', 'OUT Y1', 'END']);
  const target = gx(['LD X0', 'MPS', 'OUT Y0', 'MPP', 'AND X1', 'OUT Y1', 'END']);
  const compared = compareMitsubishiPrograms(source, target);
  for (const device of ['Y0', 'Y1']) {
    const a = compared.instructions.find((i) => i.op === 'OUT' && i.operands[0] === device)!;
    const b = compared.comparison!.target.instructions.find(
      (i) => i.op === 'OUT' && i.operands[0] === device,
    )!;
    assert.equal(a.comparisonRow, b.comparisonRow);
    assert.equal(a.difference, undefined);
  }
});
