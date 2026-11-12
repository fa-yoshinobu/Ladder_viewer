import { requireValue } from '../src/requireValue';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseKeyenceMnm } from '../src/keyence/parser.ts';
import { keyenceInstructionCopyText } from '../src/keyence/instructionCopy.ts';
const program = (line: string, comments: Record<string, string> = {}) =>
  parseKeyenceMnm(
    new TextEncoder().encode('DEVICE:99\n;Synthetic heading\n' + line).buffer,
    'synthetic.mnm',
    comments,
  );
test('Keyence copy uses command then address/comment and omits the circuit heading', () => {
  const p = program('LD MR001 ; synthetic condition');
  assert.equal(
    keyenceInstructionCopyText(requireValue(p.instructions[0]), p),
    'LD MR001\r\nMR001: synthetic condition',
  );
});
test('Keyence copy keeps every operand comment and unassigned inline comment without truncation', () => {
  const p = program('MOV DM001 DM002 ; command comment', {
    DM1: 'source\nfull text',
    DM2: 'destination',
  });
  assert.equal(
    keyenceInstructionCopyText(requireValue(p.instructions[0]), p),
    'MOV DM001 DM002\r\nDM001: source\r\nfull text\r\nDM002: destination\r\ncommand comment',
  );
});
test('Keyence timer comments use the timer address and no unrelated comments', () => {
  const p = program('TMR #7 #10 ; timer detail', { T7: 'external', MR5: 'unrelated' });
  assert.equal(
    keyenceInstructionCopyText(requireValue(p.instructions[0]), p),
    'TMR #7 #10\r\nT7: timer detail',
  );
});
test('Keyence operand-free instructions copy as their original command', () => {
  const p = program('MEP');
  assert.equal(keyenceInstructionCopyText(requireValue(p.instructions[0]), p), 'MEP');
});
