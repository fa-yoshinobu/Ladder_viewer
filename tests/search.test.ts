import test from 'node:test';
import assert from 'node:assert/strict';
import type { Instruction, Program } from '../src/model.ts';
import { buildSearchIndex, searchInstructions } from '../src/search.ts';

function program(records: Partial<Instruction>[]): Program {
  return {
    name: 'SAMPLE',
    cpu: 'SAMPLE',
    networks: [],
    warnings: [],
    instructions: records.map((record, index) => ({
      id: 'synthetic-' + index,
      sourceRow: index + 1,
      step: String(index * 2),
      op: 'NOP',
      operands: [],
      note: '',
      statement: '',
      ...record,
    })),
  };
}
function comparison(source: Program, target: Program): Program {
  return {
    ...source,
    comparison: {
      target,
      sourceProject: 'SAMPLE_BEFORE',
      targetProject: 'SAMPLE_AFTER',
      sourceName: 'SAMPLE_A',
      targetName: 'SAMPLE_B',
      differentRows: 0,
      rowCount: source.instructions.length,
      changes: [],
      shiftedSteps: 0,
    },
  };
}

test('search includes original command, every operand, STEP, notes, statements and full device comments', () => {
  const p = program([
    {
      op: 'MOV',
      operands: ['K7', 'D20'],
      step: '12',
      note: '試験メモ\n継続行',
      statement: '架空の開始条件',
    },
    { op: 'LD', operands: ['X1'], step: '30' },
  ]);
  const index = buildSearchIndex(p, { D20: '設定指令\n全文コメントの末尾' }, 'both');
  for (const query of [
    'MOV',
    'K7',
    'D20',
    'MOV K7 D20',
    '12',
    'STEP 12',
    '試験メモ 継続行',
    '架空の開始条件',
    '設定指令 全文コメントの末尾',
  ]) {
    assert.equal(
      searchInstructions(index, query, 'exact')[0]?.instruction,
      p.instructions[0],
      query,
    );
  }
  assert.equal(
    searchInstructions(index, 'メモ 指令 末尾', 'partial')[0]?.instruction,
    p.instructions[0],
  );
  assert.deepEqual(searchInstructions(index, 'メモ X1', 'partial'), []);
});

test('NFKC, case and whitespace normalization match queries without modifying source instructions', () => {
  const p = program([
    { op: 'MOV', operands: ['K7', 'D20'], note: ' ｶﾅ\n  表示 ', statement: 'TEST  MODE' },
  ]);
  const before = JSON.stringify(p);
  const index = buildSearchIndex(p, {}, 'source');
  assert.equal(
    searchInstructions(index, 'ｍｏｖ　Ｋ７\tＤ２０', 'exact')[0]?.instruction,
    p.instructions[0],
  );
  assert.equal(searchInstructions(index, 'カナ　表示', 'exact')[0]?.instruction, p.instructions[0]);
  assert.equal(
    searchInstructions(index, ' test\n mode ', 'exact')[0]?.instruction,
    p.instructions[0],
  );
  assert.ok(index[0].fields.includes('カナ 表示'));
  assert.equal(JSON.stringify(p), before);
});

test('indexed operands retain their full spelling and also match their base device and comment', () => {
  const p = program([{ op: 'MOV', operands: ['D120LZ3', 'U2Z1\\G30Z4'] }]);
  const index = buildSearchIndex(p, { D120: '架空設定値', 'U2\\G30': '架空通信領域' }, 'both');
  for (const query of ['D120LZ3', 'D120', 'U2Z1\\G30Z4', 'U2\\G30', '架空設定値', '架空通信領域']) {
    assert.equal(
      searchInstructions(index, query, 'exact')[0]?.instruction,
      p.instructions[0],
      query,
    );
  }
  assert.equal(searchInstructions(index, 'D120 LZ3 通信', 'partial').length, 1);
});

test('pointer comments are searchable and quoted strings or ZR devices are not stripped as indexes', () => {
  const p = program([{ op: '#P8' }, { op: '$MOV', operands: ['"SAMPLE Z3"', 'ZR200'] }]);
  const index = buildSearchIndex(p, { P8: '架空ポインター', ZR200: '架空ファイル領域' }, 'source');
  assert.equal(
    searchInstructions(index, '架空ポインター', 'exact')[0]?.instruction,
    p.instructions[0],
  );
  assert.equal(
    searchInstructions(index, '"SAMPLE Z3"', 'exact')[0]?.instruction,
    p.instructions[1],
  );
  assert.equal(searchInstructions(index, 'ZR200', 'exact')[0]?.instruction, p.instructions[1]);
  assert.deepEqual(searchInstructions(index, '"SAMPLE "', 'exact'), []);
  assert.deepEqual(searchInstructions(index, 'R200', 'exact'), []);
});

test('comparison display filters sides and keeps identical rows and ids as separate results', () => {
  const source = program([{ op: 'LD', operands: ['X0'], comparisonRow: 3 }]);
  const target = program([{ op: 'LD', operands: ['X0'], comparisonRow: 3 }]);
  const p = comparison(source, target);
  const both = searchInstructions(buildSearchIndex(p, {}, 'both'), 'LD', 'exact');
  assert.equal(both.length, 2);
  assert.deepEqual(
    both.map((entry) => entry.side),
    ['source', 'target'],
  );
  assert.equal(both[0].instruction, source.instructions[0]);
  assert.equal(both[1].instruction, target.instructions[0]);
  const sourceOnly = buildSearchIndex(p, {}, 'source');
  const targetOnly = buildSearchIndex(p, {}, 'target');
  assert.deepEqual(
    sourceOnly.map((entry) => entry.side),
    ['source'],
  );
  assert.deepEqual(
    targetOnly.map((entry) => entry.side),
    ['target'],
  );
  assert.equal(sourceOnly[0].instruction, source.instructions[0]);
  assert.equal(targetOnly[0].instruction, target.instructions[0]);
});

test('normal programs always index their own source and rebuilding does not retain another program', () => {
  const first = program([{ op: 'OUT', operands: ['Y0'] }]);
  const second = program([{ op: 'OUT', operands: ['Y1'] }]);
  for (const display of ['both', 'source', 'target'] as const) {
    const index = buildSearchIndex(first, {}, display);
    assert.deepEqual(
      index.map((entry) => entry.side),
      ['source'],
    );
    assert.equal(searchInstructions(index, 'Y0', 'exact').length, 1);
  }
  assert.deepEqual(searchInstructions(buildSearchIndex(second, {}, 'both'), 'Y0', 'exact'), []);
});

test('partial terms can match separate fields while exact mode requires one entire field', () => {
  const p = program([{ op: 'MOV', operands: ['D0', 'D1'], note: '試験値' }]);
  const index = buildSearchIndex(p, {}, 'source');
  assert.equal(searchInstructions(index, 'MOV 試験', 'partial').length, 1);
  assert.deepEqual(searchInstructions(index, 'MOV 試験', 'exact'), []);
  assert.equal(searchInstructions(index, 'MOV D0 D1', 'exact').length, 1);
  assert.deepEqual(searchInstructions(index, 'MOV D0', 'exact'), []);
});

test('empty queries match nothing and non-regex punctuation remains literal', () => {
  const p = program([{ op: '$MOV', operands: ['"[SAMPLE]"', 'D0'], step: '' }]);
  const index = buildSearchIndex(p, {}, 'source');
  const before = JSON.stringify(index);
  for (const mode of ['partial', 'exact'] as const) {
    for (const query of ['', '  \n\t', '　'])
      assert.deepEqual(searchInstructions(index, query, mode), []);
  }
  assert.equal(searchInstructions(index, '[SAMPLE]', 'partial').length, 1);
  assert.deepEqual(searchInstructions(index, '.*', 'partial'), []);
  assert.deepEqual(searchInstructions(index, 'STEP', 'exact'), []);
  assert.equal(JSON.stringify(index), before);
});

test('full comments remain searchable past display truncation and exact device comments take precedence', () => {
  const p = program([{ op: 'LD', operands: ['M20Z1'] }]);
  const comment = '長い架空コメント'.repeat(30) + '\n検索用の末尾';
  const index = buildSearchIndex(p, { M20: '基底コメント', M20Z1: comment }, 'source');
  assert.equal(
    searchInstructions(index, '検索用の末尾', 'partial')[0]?.instruction,
    p.instructions[0],
  );
  assert.equal(searchInstructions(index, comment, 'exact')[0]?.instruction, p.instructions[0]);
  assert.deepEqual(searchInstructions(index, '基底コメント', 'partial'), []);
  assert.equal(searchInstructions(index, 'M20', 'exact')[0]?.instruction, p.instructions[0]);
});
