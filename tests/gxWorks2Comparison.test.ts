import test from 'node:test';
import assert from 'node:assert/strict';
import { comparisonGroups, isComparisonHeader, parseComparison } from '../src/comparison.ts';
import { parseCsvBatch } from '../src/batch.ts';
import { parseProgram } from '../src/model.ts';
import { gridLayout } from '../src/layout.ts';

const tsv = (rows: string[][]) =>
  rows
    .map((row) => row.map((value) => '"' + value.replaceAll('"', '""') + '"').join('\t'))
    .join('\n');
const fixture = (metadata: string[], resultHeader: string, rows: string[][]) =>
  tsv([
    ...metadata.map((value) => [value]),
    ['行', 'ステップ', '照合元', 'ステップ', '照合先', resultHeader],
    ...rows,
  ]);
const bytes = (text: string) => new TextEncoder().encode(text).buffer;

test('trailing notes are counted in the owning circuit on both comparison sides', () => {
  const p = parseComparison(
    fixture([], '比較結果', [
      ['1', '10', 'LD X1', '5', 'LD X1', '一致'],
      ['2', '11', 'OUT Y1', '6', 'OUT Y1', '一致'],
      ['3', '12', '   <source note>', '', '', '照合元のみ'],
      ['4', '20', 'LD X2', '15', 'LD X2', '一致'],
      ['5', '21', 'OUT Y2', '16', 'OUT Y2', '一致'],
      ['6', '', '', '17', '   <target note>', '照合先のみ'],
      ['7', '30', 'LD X3', '25', 'LD X3', '一致'],
      ['8', '31', 'OUT Y3', '26', 'OUT Y3', '一致'],
    ]),
    'synthetic-notes.csv',
  );
  const comparison = p.comparison!;
  const groups = comparisonGroups(p.networks, comparison);
  assert.deepEqual(
    groups.map((group) => group.changes.map((change) => [change.sourceStep, change.targetStep])),
    [[['12', '']], [['', '17']], []],
  );
  assert.equal(groups[0].source[0].instructions.at(-1)?.note, 'source note');
  assert.equal(groups[1].target[0].instructions.at(-1)?.note, 'target note');
  assert.equal(comparison.shiftedSteps, 6);
});

test('ASCII statements and uppercase pointers produce the same circuits as a normal CSV', () => {
  const normal = parseProgram(
    tsv([
      ['ステップ番号', '行間ステートメント', '命令', 'I/O(デバイス)'],
      ['0', 'Auto start', '', ''],
      ['4', '', 'LD', 'X901'],
      ['5', '', 'OUT', 'Y901'],
      ['6', 'p77', '', ''],
      ['10', '', 'P77', ''],
      ['11', '', 'LD', 'X902'],
      ['12', '', 'OUT', 'Y902'],
      ['13', '', 'END', ''],
    ]),
    'synthetic.csv',
  );
  const commands = [
    ['0', 'Auto start'],
    ['4', 'LD X901'],
    ['5', 'OUT Y901'],
    ['6', 'p77'],
    ['10', 'P77'],
    ['11', 'LD X902'],
    ['12', 'OUT Y902'],
    ['13', 'END'],
  ];
  const comparison = parseComparison(
    fixture(
      [],
      '比較結果',
      commands.map(([step, text], index) => [String(index + 1), step, text, step, text, '一致']),
    ),
    'synthetic-comparison.csv',
  );
  const shape = (program: typeof normal) => ({
    instructions: program.instructions.map(({ step, op, operands, note, statement }) => ({
      step,
      op,
      operands,
      note,
      statement,
    })),
    networks: program.networks.map((network) => {
      const grid = gridLayout(network);
      return {
        title: network.title,
        step: network.step,
        pointer: network.pointer?.op,
        warnings: network.warnings,
        rows: grid.rows,
        pages: grid.pages,
        symbols: grid.symbols.map((symbol) => ({
          op: symbol.instruction.op,
          operands: symbol.instruction.operands,
          col: symbol.col,
          row: symbol.row,
          span: symbol.span,
        })),
        wires: grid.wires.map(({ x1, y1, x2, y2, difference }) => ({ x1, y1, x2, y2, difference })),
      };
    }),
  });
  assert.deepEqual(shape(comparison), shape(normal));
  assert.deepEqual(shape(comparison.comparison!.target), shape(normal));
  assert.equal(
    comparison.instructions.some((instruction) => instruction.op === 'p77'),
    false,
  );
  assert.equal(comparison.networks.find((network) => network.pointer?.op === 'P77')?.title, 'p77');
  assert.equal(comparison.comparison!.differentRows, 0);
});

test('GX Works2 headers and adjacent arrow metadata retain quoted operands and one-sided rows', () => {
  const p = parseComparison(
    fixture(
      [
        '照合元: before "quoted"',
        '    -> C:\\synthetic\\SRC_UNIT',
        '照合先：after',
        '    -> synthetic/TGT_UNIT',
      ],
      '比較結果',
      [
        ['1', '0', 'LD X31', '0', 'LD X31', '一致'],
        ['2', '1', '$MOV "AA BB" D901', '1', '$MOV "CC DD" D901', '不一致'],
        ['3', '', '', '5', 'INC D901', '追加'],
        ['4', '5', 'LD X32', '6', 'LD X32', '一致'],
        ['5', '6', 'OUT Y32', '7', 'OUT Y32', '一致'],
      ],
    ),
    'ordinary-input.csv',
  );
  const comparison = p.comparison!;
  assert.equal(p.name, 'ordinary-input.csv');
  assert.equal(comparison.sourceProject, 'before "quoted"');
  assert.equal(comparison.targetProject, 'after');
  assert.equal(comparison.sourceName, 'SRC_UNIT');
  assert.equal(comparison.targetName, 'TGT_UNIT');
  assert.deepEqual(p.instructions[1].operands, ['"AA BB"', 'D901']);
  assert.deepEqual(comparison.target.instructions[1].operands, ['"CC DD"', 'D901']);
  assert.ok(!p.instructions.some((instruction) => instruction.op === 'INC'));
  assert.equal(
    comparison.changes.find((change) => change.kind === 'added')?.targetText,
    'INC D901',
  );
  assert.equal(comparison.differentRows, 2);
  assert.equal(
    isComparisonHeader(['行', 'ステップ', '照合元', 'ステップ', '照合先', '比較結果']),
    true,
  );
  assert.equal(
    isComparisonHeader(['行', 'ステップ', '照合元', 'ステップ', '照合先', '照合結果']),
    true,
  );
  assert.equal(
    isComparisonHeader(['行', 'ステップ', '照合元', 'ステップ', '照合先', '別の列']),
    false,
  );
});

test('GX Works2 permits an empty source and never searches across another metadata section', () => {
  const p = parseComparison(
    fixture(
      [
        '照合元：left-project',
        '別セクション：placeholder',
        '    -> NOT_THE_SOURCE',
        '照合先: right-project',
        '    -> Z:\\synthetic\\TARGET_ONLY',
      ],
      '比較結果',
      [
        ['1', '', '', '0', 'LD X41', '追加'],
        ['2', '', '', '1', 'OUT Y41', '追加'],
      ],
    ),
    'single-side.csv',
  );
  assert.equal(p.instructions.length, 0);
  assert.equal(p.comparison!.target.instructions.length, 2);
  assert.equal(p.comparison!.sourceProject, 'left-project');
  assert.equal(p.comparison!.targetProject, 'right-project');
  assert.equal(p.comparison!.sourceName, '');
  assert.equal(p.comparison!.targetName, 'TARGET_ONLY');
  assert.deepEqual(
    p.comparison!.changes.map((change) => change.kind),
    ['added', 'added'],
  );
});

test('GX Works3 metadata takes priority and batch routing uses headers with Works2 CPU metadata', () => {
  const rows = [
    ['1', '0', 'LD X61', '0', 'LD X61', '一致'],
    ['2', '1', 'OUT Y61', '1', 'OUT Y61', '一致'],
  ];
  const works3 = fixture(
    [
      '照合元：fallback-left',
      '    -> WRONG_LEFT',
      '照合先: fallback-right',
      '    -> WRONG_RIGHT',
      '照合元プロジェクト: preferred-left',
      '照合先プロジェクト：preferred-right',
      '照合元データ名：MAIN_LEFT',
      '照合先データ名: MAIN_RIGHT',
    ],
    '照合結果',
    rows,
  );
  const p = parseComparison(works3, 'modern.csv');
  assert.equal(p.comparison!.sourceProject, 'preferred-left');
  assert.equal(p.comparison!.targetProject, 'preferred-right');
  assert.equal(p.comparison!.sourceName, 'MAIN_LEFT');
  assert.equal(p.comparison!.targetName, 'MAIN_RIGHT');
  assert.equal(p.comparison!.differentRows, 0);
  const works2 = fixture(
    ['照合元: old-left', '    -> OLD_LEFT', '照合先：old-right', '    -> OLD_RIGHT'],
    '比較結果',
    rows,
  );
  const normal = tsv([
    ['synthetic'],
    ['PC情報:', 'QCPU TEST'],
    ['ステップ番号', '命令', 'I/O(デバイス)'],
    ['0', 'LD', 'X71'],
    ['1', 'OUT', 'Y71'],
  ]);
  const result = parseCsvBatch([
    { name: 'ordinary-name.csv', bytes: bytes(works2) },
    { name: 'also-ordinary.csv', bytes: bytes(works3) },
    { name: 'diff-looking-name.csv', bytes: bytes(normal) },
  ]);
  assert.deepEqual(result.errors, []);
  assert.equal(result.programs.length, 3);
  assert.deepEqual(result.comments, []);
  assert.equal(
    result.programs.find((program) => program.name === 'ordinary-name.csv')?.comparison?.sourceName,
    'OLD_LEFT',
  );
  assert.equal(
    result.programs.find((program) => program.name === 'also-ordinary.csv')?.comparison?.sourceName,
    'MAIN_LEFT',
  );
  const ordinary = result.programs.find((program) => program.name === 'diff-looking-name.csv');
  assert.ok(ordinary);
  assert.equal(ordinary.comparison, undefined);
  assert.equal(ordinary.cpu, 'QCPU TEST');
});
