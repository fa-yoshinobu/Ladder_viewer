import test from 'node:test';
import assert from 'node:assert/strict';
import { instructionCopyText } from '../src/instructionCopy.ts';
import type { Instruction } from '../src/model.ts';

const command = (op: string, operands: string[] = [], note = ''): Instruction => ({ id: 'copy-test', sourceRow: 1, step: '0', op, operands, note, statement: '' });

test('contacts, coils and operand-free instructions copy the original command as plain text', () => {
  assert.equal(instructionCopyText(command('ANI', ['X0']), { X0: '非常停止\n入力' }), 'ANI X0\r\nX0: 非常停止\r\n入力');
  assert.equal(instructionCopyText(command('OUT', ['Y1']), { Y1: '運転要求' }), 'OUT Y1\r\nY1: 運転要求');
  assert.equal(instructionCopyText(command('MEP'), {}), 'MEP');
});

test('multiple operands keep full indexed addresses and unabridged comments, followed by the note', () => {
  const comment = '長いコメントを画面表示の省略や折り返しに影響されずコピーする'.repeat(5);
  const instruction = command('MOV', ['D100Z0', 'D200LZ12'], 'CSVノート\r\n続き');
  assert.equal(instructionCopyText(instruction, { D100: comment, D200LZ12: '書込み先' }), `MOV D100Z0 D200LZ12\r\nD100Z0: ${comment}\r\nD200LZ12: 書込み先\r\nCSVノート\r\n続き`);
});

test('missing comments do not add empty lines or unrelated data', () => {
  assert.equal(instructionCopyText(command('OUT', ['T7', 'K9']), { X0: '別の接点' }), 'OUT T7 K9');
});

test('pointer labels copy their own device comment even without operands', () => {
  assert.equal(instructionCopyText(command('P42'), { P42: 'サブルーチン' }), 'P42\r\nP42: サブルーチン');
});

test('FB parent includes pins and a pin copied alone does not include its parent or sibling', () => {
  const pin = command('INPUT IN:値', ['D100']);
  const sibling = command('OUTPUT OUT:結果', ['D200']);
  const parent = { ...command('FB_CALL TEST'), pins: [pin, sibling] };
  assert.equal(instructionCopyText(parent, { D100: '入力', D200: '結果' }), 'FB_CALL TEST\r\nINPUT IN:値 D100\r\nD100: 入力\r\nOUTPUT OUT:結果 D200\r\nD200: 結果');
  assert.equal(instructionCopyText(pin, { D100: '入力', D200: '結果' }), 'INPUT IN:値 D100\r\nD100: 入力');
});