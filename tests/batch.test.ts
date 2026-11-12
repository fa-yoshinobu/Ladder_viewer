import { requireValue } from '../src/requireValue';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvBatch } from '../src/batch.ts';
const encode = (text: string) => new TextEncoder().encode(text).buffer;
const csv =
  '"program"\n"機種情報:"\t"RCPU R120"\n"ステップ番号"\t"命令"\t"I/O(デバイス)"\n"0"\t"LD"\t"SM400"\n"1"\t"OUT"\t"M0"\n';
test('batch keeps all programs sorted and excludes comment CSV by its columns', () => {
  const result = parseCsvBatch([
    { name: '10_SAMPLE.csv', bytes: encode(csv) },
    {
      name: 'renamed.csv',
      bytes: encode('"project"\n"デバイス名"\t"Japanese/日本語"\n"M0"\t"運転"'),
    },
    { name: '02_SAMPLE.csv', bytes: encode(csv) },
  ]);
  assert.deepEqual(
    result.programs.map((p) => p.name),
    ['02_SAMPLE.csv', '10_SAMPLE.csv'],
  );
  assert.deepEqual(result.comments, ['renamed.csv']);
  assert.equal(requireValue(result.commentsByProgram['02_SAMPLE.csv']).M0, '運転');
  assert.deepEqual(result.errors, []);
  assert.ok(result.programs.every((p) => p.instructions.length === 2));
});
test('a bad CSV does not discard other programs and progress includes every CSV', () => {
  const progress: number[] = [];
  const result = parseCsvBatch(
    [
      { name: 'bad.csv', bytes: encode('broken') },
      { name: 'good.csv', bytes: encode(csv) },
    ],
    (done) => progress.push(done),
  );
  assert.deepEqual(
    result.programs.map((p) => p.name),
    ['good.csv'],
  );
  assert.equal(requireValue(result.errors[0]).name, 'bad.csv');
  assert.deepEqual(progress, [1, 2]);
});
test('different folders retain distinct program names and independent instructions', () => {
  const result = parseCsvBatch([
    { name: 'a/main.csv', bytes: encode(csv) },
    { name: 'b/main.csv', bytes: encode(csv.replace('"M0"', '"M1"')) },
  ]);
  assert.deepEqual(
    result.programs.map((p) => p.name),
    ['a/main.csv', 'b/main.csv'],
  );
  assert.deepEqual(
    result.programs.map((p) => requireValue(p.instructions[1]).operands),
    [['M0'], ['M1']],
  );
});

test('comments are isolated by native folder keys even when display names omit folder paths', () => {
  const result = parseCsvBatch([
    { name: 'alpha.csv', folder: '0', bytes: encode(csv) },
    { name: 'a/COMMENT.csv', folder: '0', bytes: encode('デバイス名\tJapanese/日本語\nM0\t運転A') },
    { name: 'beta.csv', folder: '1', bytes: encode(csv) },
    { name: 'b/comment.csv', folder: '1', bytes: encode('デバイス名\tJapanese/日本語\nM0\t運転B') },
    { name: 'empty.csv', folder: '2', bytes: encode(csv) },
  ]);
  assert.equal(requireValue(result.commentsByProgram['alpha.csv']).M0, '運転A');
  assert.equal(requireValue(result.commentsByProgram['beta.csv']).M0, '運転B');
  assert.equal(requireValue(result.commentsByProgram['empty.csv']).M0, undefined);
  assert.notEqual(result.commentsByProgram['alpha.csv'], result.commentsByProgram['beta.csv']);
  assert.deepEqual(result.errors, []);
});

test('relative folder comments do not fall back to parent tables and comment.csv takes precedence', () => {
  const progress: number[] = [];
  const result = parseCsvBatch(
    [
      { name: 'a/main.csv', bytes: encode(csv) },
      { name: 'a/other.csv', bytes: encode('デバイス名\tJapanese/日本語\nM0\t別表') },
      { name: 'a/COMMENT.csv', bytes: encode('デバイス名\tJapanese/日本語\nM0\t同じ場所') },
      { name: 'a/sub/main.csv', bytes: encode(csv) },
      { name: 'b/main.csv', bytes: encode(csv) },
    ],
    (done) => progress.push(done),
  );
  assert.equal(requireValue(result.commentsByProgram['a/main.csv']).M0, '同じ場所');
  assert.equal(requireValue(result.commentsByProgram['a/sub/main.csv']).M0, undefined);
  assert.equal(requireValue(result.commentsByProgram['b/main.csv']).M0, undefined);
  assert.deepEqual(progress, [1, 2, 3, 4, 5]);
});
