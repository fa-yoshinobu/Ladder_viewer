import { requireValue } from '../src/requireValue';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProgram } from '../src/model.ts';
import { parseComparison } from '../src/comparison.ts';
import { comparisonDisplayProgram } from '../src/comparisonDisplay.ts';
import {
  BASELINE,
  LADDER_WIDTH,
  NOTE_LINE_HEIGHT,
  PAGE_GAP,
  ROW,
  displayGrid,
  drawingMetrics,
  gridLayout,
  networkSize,
  noteLayout,
} from '../src/layout.ts';
import { drawingHeight, instructionDrawingOffset, networkPrefix } from '../src/NetworkDrawing.tsx';

type Command = { op: string; operands?: string[]; note?: string; statement?: string };
const tsv = (rows: string[][]) =>
  rows
    .map((row) => row.map((value) => '"' + value.replaceAll('"', '""') + '"').join('\t'))
    .join('\r\n');
function normal(commands: Command[]) {
  return parseProgram(
    tsv([
      ['ステップ番号', '行間ステートメント', '命令', 'I/O(デバイス)', 'ノート'],
      ...commands.flatMap((command, index) => [
        [
          String(index),
          command.statement ?? '',
          command.op,
          command.operands?.[0] ?? '',
          command.note ?? '',
        ],
        ...(command.operands?.slice(1) ?? []).map((operand) => ['', '', '', operand, '']),
      ]),
    ]),
    'synthetic-notes.csv',
  );
}
const legacyComparison = (source: string[], target: string[]) =>
  parseComparison(
    tsv([
      ['行', 'ステップ', '照合元', 'ステップ', '照合先', '比較結果'],
      ...Array.from({ length: Math.max(source.length, target.length) }, (_, index) => [
        String(index + 1),
        source[index] ? String(index) : '',
        source[index] ?? '',
        target[index] ? String(index) : '',
        target[index] ?? '',
        '不一致',
      ]),
    ]),
    'synthetic-note-comparison.csv',
  );

test('each MOV owns its note row and notes no longer add a network prefix', () => {
  const p = normal([
      { op: 'LD', operands: ['X11'], statement: 'Synthetic section' },
      { op: 'MOV', operands: ['K7', 'D30'], note: 'move one' },
      { op: 'MOV', operands: ['K8', 'D31'], note: 'move two' },
    ]),
    n = requireValue(p.networks[0]),
    raw = p.instructions.map((instruction) => instruction.note),
    zoom = 1.25;
  n.warnings = ['Synthetic warning'];
  const notes = noteLayout(n),
    metrics = drawingMetrics(n, ROW);
  assert.deepEqual(
    notes.map((note) => ({ owner: note.owner, row: note.row, lines: note.lines })),
    [
      { owner: p.instructions[1], row: 0, lines: ['move one'] },
      { owner: p.instructions[2], row: 1, lines: ['move two'] },
    ],
  );
  assert.equal(metrics.rowHeight, ROW + metrics.padding);
  for (const note of notes) {
    assert.ok(note.top + metrics.padding >= 0);
    assert.equal(
      note.top + metrics.padding + note.lines.length * NOTE_LINE_HEIGHT + 3,
      metrics.baseline - 11,
    );
  }
  assert.equal(networkPrefix(n, zoom), 18 * zoom + 25);
  assert.equal(drawingHeight(n, ROW, zoom), 2 * metrics.rowHeight * zoom + 18 * zoom + 25);
  assert.deepEqual(
    p.instructions.map((instruction) => instruction.note),
    raw,
  );
});

test('circuits without notes retain their original dimensions and baseline', () => {
  const n = requireValue(
    normal([
      { op: 'LD', operands: ['X12'] },
      { op: 'OUT', operands: ['Y12'] },
    ]).networks[0],
  );
  assert.deepEqual(noteLayout(n), []);
  for (const rowHeight of [ROW, 72]) {
    assert.deepEqual(drawingMetrics(n, rowHeight), { padding: 0, rowHeight, baseline: BASELINE });
    for (const mode of ['wrap', 'scroll'] as const)
      assert.deepEqual(networkSize(n, rowHeight, mode), { width: LADDER_WIDTH, height: rowHeight });
  }
});

test('multiline, contact, coil, pointer, FB-pin and hidden-command notes remain visible without negative tops', () => {
  const fixtures: { name: string; commands: Command[]; padding: boolean }[] = [
    {
      name: 'multiline',
      padding: true,
      commands: [
        { op: 'LD', operands: ['X13'] },
        { op: 'MOV', operands: ['K1', 'D32'], note: 'one\ntwo\nthree' },
      ],
    },
    {
      name: 'contact',
      padding: true,
      commands: [
        { op: 'LD', operands: ['X14'], note: 'input' },
        { op: 'OUT', operands: ['Y14'] },
      ],
    },
    {
      name: 'coil',
      padding: true,
      commands: [
        { op: 'LD', operands: ['X15'] },
        { op: 'OUT', operands: ['Y15'], note: 'coil' },
      ],
    },
    {
      name: 'pointer',
      padding: false,
      commands: [
        { op: 'P77', note: 'pointer' },
        { op: 'LD', operands: ['X16'] },
        { op: 'OUT', operands: ['Y16'] },
      ],
    },
    {
      name: 'FB',
      padding: true,
      commands: [
        { op: 'LD', operands: ['X17'] },
        { op: 'FBCALL SyntheticFB', note: 'fb' },
        { op: 'SyntheticFB IN:Enable', operands: ['M17'], note: 'pin' },
        { op: 'SyntheticFB OUT:Value', operands: ['D33'] },
      ],
    },
    {
      name: 'hidden',
      padding: true,
      commands: [
        { op: 'LD', operands: ['X18'] },
        { op: 'MPS', note: 'save' },
        { op: 'MOV', operands: ['K1', 'D34'] },
        { op: 'MPP', note: 'restore' },
        { op: 'MOV', operands: ['K2', 'D35'] },
      ],
    },
  ];
  for (const fixture of fixtures) {
    const p = normal(fixture.commands),
      n = requireValue(p.networks[0]),
      raw = p.instructions.map((instruction) => instruction.note);
    const notes = noteLayout(n),
      metrics = drawingMetrics(n, ROW),
      grid = gridLayout(n);
    for (const instruction of p.instructions.filter((instruction) => instruction.note)) {
      const owners = notes.filter((note) => note.instructions.includes(instruction));
      assert.equal(owners.length, 1, fixture.name + ' retains each original note exactly once');
      for (const line of instruction.note.split('\n'))
        assert.ok(
          requireValue(owners[0]).lines.includes(line),
          fixture.name + ' retains full note text',
        );
    }
    for (const note of notes) {
      assert.ok(note.top + metrics.padding >= 0, fixture.name + ' note is inside its row');
      assert.ok(
        note.pointer
          ? n.pointer === note.owner
          : grid.symbols.some((symbol) => symbol.instruction === note.owner),
        fixture.name + ' has a visible owner',
      );
    }
    assert.equal(metrics.padding > 0, fixture.padding, fixture.name + ' padding');
    if (fixture.name === 'pointer') assert.equal(requireValue(notes[0]).pointer, true);
    if (fixture.name === 'multiline') {
      assert.equal(metrics.padding, -requireValue(notes[0]).top);
      assert.equal(metrics.rowHeight, ROW + metrics.padding);
    }
    assert.deepEqual(
      p.instructions.map((instruction) => instruction.note),
      raw,
    );
  }
});

test('comparison sides share note padding and single-side display restores natural metrics without mutating originals', () => {
  const p = legacyComparison(
    ['LD X21', 'MOV K1 D40', '   <left>', 'MOV K2 D41', 'END'],
    [
      'LD X21',
      'MOV K1 D40',
      '   <right one>',
      '   <right two>',
      '   <right three>',
      'MOV K2 D41',
      'END',
    ],
  );
  const source = requireValue(p.networks[0]),
    target = requireValue(p.comparison!.target.networks[0]);
  const a = drawingMetrics(source, ROW),
    b = drawingMetrics(target, ROW);
  const naturalSource = drawingMetrics({ ...source, comparisonNotePadding: undefined }, ROW);
  const naturalTarget = drawingMetrics({ ...target, comparisonNotePadding: undefined }, ROW);
  assert.ok(naturalTarget.padding > naturalSource.padding);
  assert.deepEqual(a, b);
  assert.equal(a.padding, naturalTarget.padding);
  const laterRow = (network: typeof source) =>
    gridLayout(network).symbols.find((symbol) => symbol.instruction.operands.includes('D41'))!.row;
  assert.equal(
    laterRow(source) * a.rowHeight + a.baseline,
    laterRow(target) * b.rowHeight + b.baseline,
  );
  const singleSource = requireValue(comparisonDisplayProgram(p, 'source').networks[0]),
    singleTarget = requireValue(comparisonDisplayProgram(p, 'target').networks[0]);
  assert.equal(Object.hasOwn(singleSource, 'comparisonNotePadding'), false);
  assert.equal(Object.hasOwn(singleTarget, 'comparisonNotePadding'), false);
  assert.equal(Object.hasOwn(singleSource, 'rowAlignment'), false);
  assert.deepEqual(drawingMetrics(singleSource, ROW), naturalSource);
  assert.deepEqual(drawingMetrics(singleTarget, ROW), naturalTarget);
  assert.equal(source.comparisonNotePadding, naturalTarget.padding);
  assert.equal(target.comparisonNotePadding, naturalTarget.padding);
});

test('notes follow compact output columns and navigation uses the same padded page geometry', () => {
  const p = normal([
      { op: 'LD', operands: ['X30'] },
      ...Array.from({ length: 25 }, (_, index) => ({ op: 'AND', operands: [`X${index + 31}`] })),
      { op: 'MOV', operands: ['K3', 'D50'], note: 'one\ntwo\nthree' },
    ]),
    n = requireValue(p.networks[0]),
    owner = p.instructions.at(-1)!,
    zoom = 1.25;
  n.title = 'Synthetic long';
  const before = JSON.stringify(gridLayout(n)),
    metrics = drawingMetrics(n, ROW);
  assert.equal(metrics.rowHeight, ROW + metrics.padding);
  assert.ok(metrics.padding > 0);
  for (const [mode, col] of [
    ['wrap', 33],
    ['scroll', 26],
  ] as const) {
    const note = requireValue(noteLayout(n, mode)[0]),
      symbol = displayGrid(n, mode).symbols.find((symbol) => symbol.instruction === owner)!;
    assert.equal(note.owner, owner);
    assert.equal(note.col, col);
    assert.equal(note.span, 3);
    assert.equal(note.row, symbol.row);
    assert.equal(note.col, symbol.col);
    assert.ok(note.top + metrics.padding >= 0);
    const offset = mode === 'wrap' ? 2 * (metrics.rowHeight + PAGE_GAP) : 0;
    assert.equal(
      instructionDrawingOffset(n, owner.id, ROW, zoom, mode),
      networkPrefix(n, zoom) + offset * zoom,
    );
  }
  assert.equal(
    JSON.stringify(gridLayout(n)),
    before,
    'note layout does not change canonical wires or coordinates',
  );
});
