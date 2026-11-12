import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProgram, instructionKey } from '../src/model.ts';
import { parseCsvBatch } from '../src/batch.ts';
import { parseComparison } from '../src/comparison.ts';
import { gridLayout, networkSize } from '../src/layout.ts';
import { instructionCopyText } from '../src/instructionCopy.ts';
import { buildSearchIndex, searchInstructions } from '../src/search.ts';
import { instructionDrawingOffset } from '../src/NetworkDrawing.tsx';
const columns = [
  'ステップ番号',
  '行間ステートメント',
  '命令',
  'I/O(デバイス)',
  '空欄',
  'PIステートメント',
  'ノート',
];
const table = (rows: string[][], delimiter = '\t') =>
  rows
    .map((row) => row.map((c) => '"' + c.replaceAll('"', '""') + '"').join(delimiter))
    .join('\r\n');
const csv = (rows: string[][], delimiter = '\t') =>
  table([['synthetic'], ['機種情報:', 'RCPU'], columns, ...rows], delimiter);

test('all four instruction spellings normalize to the same command for tab and comma CSVs', () => {
  for (const delimiter of ['\t', ','])
    for (const rows of [
      [
        ['0', '', 'MOV', 'D20'],
        ['', '', '', 'D21'],
      ],
      [['0', '', 'MOV D20 D21', '']],
      [['0', '', 'MOV', 'D20 D21']],
      [['0', '', 'MOV D20', 'D21']],
    ]) {
      const p = parseProgram(csv([...rows, ['2', '', 'END', '']], delimiter), 'synthetic.csv');
      assert.equal(instructionKey(p.instructions[0]), '["MOV",["D20","D21"]]');
      assert.deepEqual(
        p.networks.flatMap((n) => n.warnings),
        [],
      );
    }
});
test('statement and five note spellings retain the right owner and quoted semicolons are operands', () => {
  for (const rows of [
    [
      ['0', '', 'OUT', 'Y20'],
      ['', '', '', '', '', '', 'note'],
    ],
    [['0', '', 'OUT', 'Y20', '', '', 'note']],
    [['0', '', 'OUT Y20;note', '']],
    [['0', '', 'OUT', 'Y20;note']],
    [
      ['0', '', 'OUT Y20', ''],
      ['', '', '<note>', ''],
    ],
  ]) {
    const p = parseProgram(
      csv([['', '', ';*head\\r\\nnext', ''], ...rows, ['2', '', 'END', '']]),
      'synthetic.csv',
    );
    assert.equal(p.instructions[0].note, 'note');
    assert.equal(p.instructions[0].statement, 'head\nnext');
    assert.equal(p.instructions[0].op, 'OUT');
    assert.deepEqual(p.instructions[0].operands, ['Y20']);
  }
  const p = parseProgram(
    csv([['0', '', 'MOV "value; with ""quotes"""', 'D21;*memo']]),
    'strings.csv',
  );
  assert.deepEqual(p.instructions[0].operands, ['"value; with ""quotes"""', 'D21']);
  assert.equal(p.instructions[0].note, 'memo');
});
test('four PI statement spellings stay on the pointer rather than the following instruction', () => {
  for (const rows of [
    [
      ['0', '', 'P21', ''],
      ['', '', '', '', '', '*pointer'],
    ],
    [['0', '', 'P21', '', '', '*pointer']],
    [['0', '', 'P21;*pointer', '']],
    [
      ['0', '', 'P21', ''],
      ['', '', '[*pointer]', ''],
    ],
  ]) {
    const p = parseProgram(
      csv([...rows, ['1', '', 'LD', 'X21'], ['2', '', 'OUT', 'Y21']]),
      'pi.csv',
    );
    assert.equal(p.instructions[0].piStatement, 'pointer');
    assert.equal(p.networks[0].title, 'pointer');
    assert.equal(p.instructions[1].statement, '');
    assert.match(instructionCopyText(p.instructions[0], {}), /pointer/);
  }
});
test('inline ST text after END retains whitespace, ST comments, title, search and copy', () => {
  const text = '  IF D21 > 4 THEN\n    D22 := 8; (* synthetic ST comment *)\n  END_IF;';
  const p = parseProgram(
    csv([
      ['0', '', 'LD', 'X21'],
      ['1', '', 'STB7', ''],
      ['', '', '', '', '', '', '*title'],
      ['4', '', 'END', ''],
      ['<STB7>'],
      ...text.split('\n').map((line) => [line]),
      ['</STB7>'],
    ]),
    'inline.csv',
  );
  assert.equal(p.instructions.length, 3);
  const st = p.instructions[1];
  assert.equal(st.inlineST?.text, text);
  assert.equal(st.note, 'title');
  assert.equal(st.sourceRow, 5);
  assert.equal(
    searchInstructions(buildSearchIndex(p, {}, 'both'), 'synthetic ST comment', 'partial')[0]
      .instruction,
    st,
  );
  assert.ok(instructionCopyText(st, {}).includes(text.replaceAll('\n', '\r\n')));
  assert.ok(networkSize(p.networks[0]).height > 56);
  assert.ok(Number.isFinite(instructionDrawingOffset(p.networks[0], st.id, 56, 1, 'wrap')));
});
test('malformed or ambiguous inline ST bodies fail clearly instead of disappearing', () => {
  for (const rows of [
    [['0', '', 'STB1', ''], ['<STB1>'], ['D1:=2;']],
    [['0', '', 'END', ''], ['<STB2>'], ['D1:=2;'], ['</STB2>']],
    [['0', '', 'STB1', ''], ['<STB1>'], ['</STB2>']],
  ])
    assert.throws(() => parseProgram(csv(rows), 'invalid.csv'), /STB|インラインST/);
});
const fbRows = (kind: 'FB' | 'FUN' = 'FB'): string[][] => {
  const instance = kind === 'FB' ? 'Unit1.' : '',
    call = kind === 'FB' ? 'FBCALL SyntheticBlock (Unit1)' : 'FUNCALL SyntheticFun';
  return [
    ['0', '*;' + kind + ' BLK START', '', ''],
    ['0', '', 'LD', 'X21'],
    ['1', '', 'OUT', instance + 'Enable'],
    ['2', '', 'LD', 'TRUE'],
    ['3', '', 'MOV', 'D21'],
    ['', '', '', instance + 'Value'],
    ['4', '', call, ''],
    ['', '', 'Enable IN:BOOL', ''],
    ['', '', 'Value IN:INT', ''],
    ['', '', 'Result OUT:BOOL', ''],
    ['6', '', 'LD', instance + 'Result'],
    ['7', '', 'OUT', 'Y21'],
    ['8', '*;' + kind + ' BLK END', '', ''],
    ['8', '', 'END', ''],
  ];
};
test('FB and FUN group only explicit boundaries and preserve every original circuit instruction', () => {
  for (const kind of ['FB', 'FUN'] as const) {
    const p = parseProgram(csv(fbRows(kind)), 'blocks.csv'),
      n = p.networks[0],
      fb = n.functionBlock!;
    assert.ok(fb);
    assert.equal(fb.kind, kind);
    assert.equal(fb.inputs.length, 2);
    assert.equal(fb.outputs.length, 1);
    assert.deepEqual(
      p.networks.flatMap((n) => n.instructions).map((i) => i.id),
      p.instructions.map((i) => i.id),
    );
    assert.deepEqual(n.warnings, []);
    assert.ok(!n.title.includes('BLK'));
    const grid = gridLayout(n);
    assert.equal(grid.symbols.filter((s) => s.fb).length, 1);
    assert.ok(grid.symbols.some((s) => s.value === 'D21'));
    assert.equal(grid.symbols.find((s) => s.instruction.operands[0] === 'X21')?.row, 1);
    assert.equal(grid.symbols.find((s) => s.instruction.operands[0] === 'Y21')?.row, 1);
    const port = fb.inputs[1].definition;
    assert.ok(instructionDrawingOffset(n, port.id, 56, 1, 'wrap') > 0);
  }
});
test('unsupported output logic stays as original circuits without inventing a terminal mapping', () => {
  const rows = fbRows();
  rows.splice(
    rows.findIndex((row) => row[2] === 'OUT' && row[3] === 'Y21'),
    0,
    ['7', '', 'AND', 'X22'],
  );
  const p = parseProgram(csv(rows), 'fallback.csv');
  assert.ok(p.networks.every((n) => !n.functionBlock));
  assert.ok(p.networks.some((n) => n.warnings.some((w) => w.includes('元の回路'))));
  assert.ok(p.instructions.some((i) => i.op === 'AND'));
});
test('batch detects comma-separated UTF-16LE program and comments and keeps folder ownership', () => {
  const utf16 = (text: string) => {
    const bytes = Buffer.from('\uFEFF' + text, 'utf16le');
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  };
  const p = parseCsvBatch([
    { name: 'MAIN.csv', folder: '0', bytes: utf16(csv([['0', '', 'OUT', 'Y21']], ',')) },
    {
      name: 'comment.csv',
      folder: '0',
      bytes: utf16(
        table(
          [
            ['デバイス名', 'Japanese/日本語'],
            ['Y21', 'synthetic comment'],
          ],
          ',',
        ),
      ),
    },
  ]);
  assert.deepEqual(p.errors, []);
  assert.equal(p.commentsByProgram['MAIN.csv'].Y21, 'synthetic comment');
});
test('comparison keeps FB calls and mixed-case pin definitions as commands', () => {
  const lines = ['FBCALL SyntheticBlock (Unit1)', 'Enable IN:BOOL', 'Result OUT:BOOL', 'END'];
  const p = parseComparison(
    table([
      ['行', 'ステップ', '照合元', 'ステップ', '照合先', '比較結果'],
      ...lines.map((line, index) => [
        String(index + 1),
        String(index),
        line,
        String(index),
        line,
        '一致',
      ]),
    ]),
    'comparison.csv',
  );
  assert.equal(p.instructions[0].pins?.length, 2);
  assert.equal(p.comparison?.target.instructions[0].pins?.length, 2);
  assert.equal(p.comparison?.differentRows, 0);
});
