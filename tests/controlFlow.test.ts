import test from 'node:test';
import assert from 'node:assert/strict';
import type { Instruction, Network } from '../src/model.ts';
import { assignControlFlow, consumesCondition, isControlMarker } from '../src/controlFlow.ts';

type Command = [string, ...string[]];
function fixture(commands: Command[], groupSize = 1) {
  const instructions: Instruction[] = commands.map(([op, ...operands], index) => ({
    id: 'synthetic-' + index, sourceRow: index + 1, step: String(index * 3),
    op, operands, note: '', statement: ''
  }));
  const networks: Network[] = [];
  for (let start = 0; start < instructions.length; start += groupSize) {
    const group = instructions.slice(start, start + groupSize);
    networks.push({ id: group[0].id, title: '', step: group[0].step, instructions: group, actions: [], warnings: [] });
  }
  return { instructions, networks };
}
const ranges = (networks: Network[]) => [...new Set(networks.flatMap(network => network.controlRanges ?? []))];
const warnings = (networks: Network[]) => networks.flatMap(network => network.warnings);
const first = (instructions: Instruction[], op: string) => instructions.find(instruction => instruction.op === op)!;

test('control markers and condition consumers require exact opcodes', () => {
  for (const op of [
    'IF', 'THEN', 'ELSIF', 'ELSE', 'ENDIF', 'CASE', 'CASEOF', 'CASEIF', 'CASETHEN', 'CASEELSE', 'ENDCASE',
    'STFOR', 'FORBY', 'FORTO', 'FORDO', 'ENDFOR', 'WHILE', 'WHILEDO', 'ENDWHILE', 'REPEAT', 'UNTIL',
    'ENDREPEAT', 'EXIT', 'FBRET', 'STPUSH', 'STPOP', '_TMALLOC', '_TMFREE', 'JMPO'
  ]) assert.equal(isControlMarker(op), true, op);
  for (const op of ['IFX', 'ENDIF_EXTRA', 'if', 'OUT', 'FBCALL SAMPLE', 'JMP', 'CJ', 'SCJ']) {
    assert.equal(isControlMarker(op), false, op);
  }
  for (const op of ['THEN', 'CASETHEN', 'WHILEDO', 'FORDO', 'ENDREPEAT']) assert.equal(consumesCondition(op), true, op);
  for (const op of ['IF', 'UNTIL', 'REPEAT', 'ELSIF', 'THENX', 'then']) assert.equal(consumesCondition(op), false, op);
});

test('an IF without ELSE spans every intersecting network and the false gate reaches ENDIF', () => {
  const { instructions, networks } = fixture([['IF'], ['LD', 'X0'], ['THEN'], ['OUT', 'Y0'], ['ENDIF'], ['OUT', 'Y1']]);
  assignControlFlow(networks);
  const [range] = ranges(networks);
  assert.equal(range.kind, 'IF');
  assert.equal(range.start, instructions[0]);
  assert.equal(range.end, instructions[4]);
  assert.equal(range.lane, 0);
  for (const network of networks.slice(0, 5)) assert.ok(network.controlRanges?.includes(range));
  assert.equal(networks[5].controlRanges, undefined);
  assert.equal(instructions[2].controlFlow?.targetId, instructions[4].id);
  assert.equal(instructions[2].controlFlow?.targetStep, instructions[4].step);
  assert.ok(range.branches.includes(instructions[2]));
  assert.deepEqual(warnings(networks), []);
  assert.doesNotThrow(() => JSON.stringify(networks));
});

test('many ELSIF branches resolve independently without limiting their count', () => {
  const commands: Command[] = [['IF'], ['LD', 'X0'], ['THEN'], ['OUT', 'Y0']];
  for (let index = 1; index <= 8; index++) {
    commands.push(['ELSIF'], ['LD', 'X' + index], ['THEN'], ['OUT', 'Y' + index]);
  }
  commands.push(['ELSE'], ['RST', 'M0'], ['ENDIF']);
  const { instructions, networks } = fixture(commands);
  assignControlFlow(networks);
  const end = first(instructions, 'ENDIF');
  const gates = instructions.filter(instruction => instruction.op === 'THEN');
  const branches = instructions.filter(instruction => instruction.op === 'ELSIF' || instruction.op === 'ELSE');
  assert.equal(gates.length, 9);
  for (let index = 0; index < branches.length; index++) {
    assert.equal(gates[index].controlFlow?.targetId, branches[index].id);
    assert.equal(branches[index].controlFlow?.targetId, end.id);
  }
  assert.equal(ranges(networks).length, 1);
  assert.deepEqual(warnings(networks), []);
});

test('CASE alternatives and their condition gates use only the matching CASE scope', () => {
  const { instructions, networks } = fixture([
    ['CASE'], ['MOV', 'D0', 'D1'], ['CASEOF'],
    ['CASEIF'], ['LD=', 'D1', 'K1'], ['CASETHEN'], ['SET', 'Y0'],
    ['CASEIF'], ['LD=', 'D1', 'K2'], ['CASETHEN'], ['SET', 'Y1'],
    ['CASEELSE'], ['RST', 'Y0'], ['ENDCASE']
  ], 2);
  assignControlFlow(networks);
  const [range] = ranges(networks);
  const end = first(instructions, 'ENDCASE');
  assert.equal(range.kind, 'CASE');
  assert.equal(range.end, end);
  assert.equal(instructions[5].controlFlow?.targetId, instructions[7].id);
  assert.equal(instructions[9].controlFlow?.targetId, instructions[11].id);
  assert.equal(instructions[11].controlFlow?.targetId, end.id);
  assert.ok(networks.every(network => network.controlRanges?.includes(range)));
  assert.deepEqual(warnings(networks), []);
});

test('nested loops resolve nearest EXIT while FBRET leaves lexical IF and loop ranges open', () => {
  const { instructions, networks } = fixture([
    ['STFOR', 'D0'], ['FORTO', 'K8'], ['FORBY', 'K1'], ['FORDO'],
    ['WHILE'], ['LD', 'X0'], ['WHILEDO'],
    ['IF'], ['LD', 'X1'], ['THEN'], ['EXIT'], ['FBRET'], ['ENDIF'],
    ['ENDWHILE'], ['EXIT'], ['ENDFOR']
  ]);
  assignControlFlow(networks);
  const all = ranges(networks);
  assert.deepEqual(all.map(range => [range.kind, range.lane]), [['STFOR', 0], ['WHILE', 1], ['IF', 2]]);
  assert.equal(instructions[10].controlFlow?.targetId, instructions[13].id);
  assert.equal(instructions[14].controlFlow?.targetId, instructions[15].id);
  assert.equal(instructions[13].controlFlow?.targetId, instructions[4].id);
  assert.equal(instructions[15].controlFlow?.targetId, instructions[0].id);
  assert.equal(instructions[3].controlFlow?.targetId, instructions[15].id);
  assert.equal(instructions[6].controlFlow?.targetId, instructions[13].id);
  assert.equal(instructions[11].controlFlow?.kind, 'return');
  assert.equal(instructions[11].controlFlow?.targetId, undefined);
  assert.ok(networks[11].controlRanges?.includes(all[0]));
  assert.ok(networks[11].controlRanges?.includes(all[1]));
  assert.ok(networks[11].controlRanges?.includes(all[2]));
  assert.deepEqual(warnings(networks), []);
});

test('REPEAT UNTIL condition ENDREPEAT retains the condition and links the loop end to REPEAT', () => {
  const { instructions, networks } = fixture([
    ['REPEAT'], ['INC', 'D0'], ['UNTIL'], ['LD>=', 'D0', 'K4'], ['ENDREPEAT'], ['OUT', 'Y0']
  ]);
  assignControlFlow(networks);
  const [range] = ranges(networks);
  assert.equal(range.kind, 'REPEAT');
  assert.equal(range.end, instructions[4]);
  assert.equal(instructions[4].controlFlow?.targetId, instructions[0].id);
  assert.equal(instructions[2].controlFlow?.targetId, instructions[4].id);
  assert.deepEqual(instructions[3].operands, ['D0', 'K4']);
  assert.equal(networks[5].controlRanges, undefined);
  assert.deepEqual(warnings(networks), []);
});

test('generated stack and allocation markers do not invent ranges or JMPO destinations', () => {
  const { instructions, networks } = fixture([
    ['STPOP'], ['_TMALLOC', 'K4'], ['JMPO', 'K7'], ['STPUSH'], ['_TMFREE'], ['OUT', 'Y0'], ['constructor'], ['toString']
  ]);
  assignControlFlow(networks);
  assert.deepEqual(ranges(networks), []);
  for (const index of [0, 1, 3, 4]) assert.equal(instructions[index].controlFlow?.kind, 'system');
  assert.deepEqual(instructions[2].controlFlow, { kind: 'jump', label: '生成ジャンプ' });
  for (const index of [5, 6, 7]) assert.equal(instructions[index].controlFlow, undefined);
  assert.deepEqual(warnings(networks), []);
});

test('ordinary jumps resolve unique P and #P definitions but not missing or duplicate destinations', () => {
  const { instructions, networks } = fixture([
    ['P10'], ['#P20'], ['JMP', '#P10'], ['CJ', 'P20'], ['SCJ', '#P20'],
    ['P30'], ['#P30'], ['JMP', 'P30'], ['JMP', 'P40'], ['CJ', 'K2']
  ]);
  assignControlFlow(networks);
  assert.equal(instructions[2].controlFlow?.targetId, instructions[0].id);
  assert.equal(instructions[3].controlFlow?.targetId, instructions[1].id);
  assert.equal(instructions[4].controlFlow?.targetStep, instructions[1].step);
  for (const index of [7, 8, 9]) {
    assert.equal(instructions[index].controlFlow?.targetId, undefined);
    assert.equal(networks[index].warnings.length, 1);
  }
  assert.equal(warnings(networks).length, 3);
});

test('mismatched nesting is warned without closing a different range or losing raw instructions', () => {
  const { instructions, networks } = fixture([
    ['IF'], ['THEN'], ['CASE'], ['CASEOF'], ['CASEIF'], ['CASETHEN'],
    ['ENDIF'], ['ENDCASE'], ['ENDIF'], ['ELSE'], ['EXIT']
  ]);
  const original = instructions.map(({ id, sourceRow, step, op, operands, note, statement }) =>
    ({ id, sourceRow, step, op, operands: [...operands], note, statement }));
  assignControlFlow(networks);
  const [outer, inner] = ranges(networks);
  assert.equal(inner.end, instructions[7]);
  assert.equal(outer.end, instructions[8]);
  assert.equal(instructions[6].controlFlow?.targetId, undefined);
  assert.ok(networks[6].warnings.length);
  assert.ok(networks[9].warnings.length);
  assert.ok(networks[10].warnings.length);
  assert.deepEqual(instructions.map(({ id, sourceRow, step, op, operands, note, statement }) =>
    ({ id, sourceRow, step, op, operands, note, statement })), original);
});

test('duplicate ELSE and a later ELSIF are not treated as valid branches', () => {
  const { instructions, networks } = fixture([
    ['IF'], ['THEN'], ['ELSE'], ['ELSE'], ['ELSIF'], ['ENDIF']
  ]);
  assignControlFlow(networks);
  const [range] = ranges(networks);
  assert.deepEqual(range.branches, [instructions[1], instructions[2]]);
  assert.ok(networks[3].warnings.length);
  assert.ok(networks[4].warnings.length);
  assert.equal(instructions[3].controlFlow?.targetId, undefined);
  assert.equal(instructions[4].controlFlow?.targetId, undefined);
  assert.equal(range.end, instructions[5]);
});

test('unfinished ranges and EXIT have no guessed end, and program calls keep no shared state', () => {
  const open = fixture([['STFOR'], ['FORDO'], ['IF'], ['THEN'], ['EXIT']]);
  assignControlFlow(open.networks);
  assert.ok(ranges(open.networks).every(range => range.end === undefined));
  assert.equal(open.instructions[4].controlFlow?.targetId, undefined);
  assert.ok(open.networks[0].warnings.length);
  assert.ok(open.networks[2].warnings.length);
  assert.ok(open.networks[4].warnings.length);
  const next = fixture([['ENDIF'], ['ENDFOR'], ['JMP', 'P10']]);
  assignControlFlow(next.networks);
  assert.deepEqual(ranges(next.networks), []);
  assert.ok(next.networks.every(network => network.warnings.length));
  assert.ok(next.instructions.every(instruction => instruction.controlFlow?.targetId === undefined));
});

test('ranges include networks with grouped boundaries and repeat assignment does not duplicate warnings', () => {
  const { instructions, networks } = fixture([['IF'], ['THEN'], ['OUT', 'Y0'], ['ENDIF'], ['EXIT']], 2);
  assignControlFlow(networks);
  assert.equal(ranges(networks).length, 1);
  assert.ok(networks[0].controlRanges?.length);
  assert.ok(networks[1].controlRanges?.length);
  assert.equal(networks[2].controlRanges, undefined);
  const before = warnings(networks);
  assignControlFlow(networks);
  assert.deepEqual(warnings(networks), before);
  assert.equal(ranges(networks).length, 1);
  assert.equal(instructions[1].controlFlow?.targetId, instructions[3].id);
});