import { requireValue } from '../src/requireValue';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseKeyenceMnm } from '../src/keyence/parser.ts';
import {
  buildKeyenceNetworks,
  keyenceContactKey,
  keyenceSymbolDifferenceKind,
  type KeyenceExpression,
} from '../src/keyence/logic.ts';

// These instruction examples are invented; no customer/reference programs are fixtures.
const program = (lines: string[]) =>
  parseKeyenceMnm(
    new TextEncoder().encode(['DEVICE:99', ';MODULE:SyntheticReferenceLogic', ...lines].join('\n'))
      .buffer,
    'synthetic-reference-logic.mnm',
  );
function expression(value: KeyenceExpression | null): string {
  if (!value) return 'TRUE';
  if (value.kind === 'contact')
    return (value.negated ? '!' : '') + value.instruction.operands.join(' ');
  if (value.kind === 'unary') return `${value.operation}(${expression(value.input)})`;
  return `(${expression(value.left)} ${value.kind === 'and' ? '&' : '|'} ${expression(value.right)})`;
}

test('word bit, work and calculation contacts retain their join and negation', () => {
  for (const [load, and, or, operands, comparison] of [
    ['BLD.D', 'BANB.D', 'BOR.D', 'DM9700 #17', 'B.D'],
    ['BLDB.D', 'BAND.D', 'BORB.D', 'DM9700 #17', 'B.D'],
    ['LDWK', 'ANDWKB', 'ORWK', 'MR9300', 'WK'],
    ['LDWKB', 'ANDWK', 'ORWKB', 'MR9300', 'WK'],
    ['LDCAL', 'ANDCALB', 'ORCAL', '"DM9700 > #81"', 'CAL'],
    ['LDCALB', 'ANDCAL', 'ORCALB', '"DM9700 > #81"', 'CAL'],
  ]) {
    const p = program([
      `${load} ${operands}`,
      `${and} ${operands}`,
      `${or} ${operands}`,
      'OUT MR9399',
    ]);
    const [network] = buildKeyenceNetworks(p),
      condition = requireValue(requireValue(network).actions[0]).condition!;
    assert.deepEqual(requireValue(network).warnings, []);
    assert.equal(
      requireValue(network).actions.length,
      1,
      'contacts must not become output commands',
    );
    assert.equal(condition.kind, 'or');
    if (condition.kind !== 'or') continue;
    assert.equal(condition.left.kind, 'and');
    if (condition.left.kind !== 'and') continue;
    const contacts = [condition.left.left, condition.left.right, condition.right];
    contacts.forEach((contact, index) => {
      assert.equal(contact.kind, 'contact');
      if (contact.kind !== 'contact') return;
      assert.equal(contact.comparison, comparison);
      assert.equal(contact.negated, /B(?:\.D)?$/.test(requireValue(p.instructions[index]).opcode));
      assert.equal(contact.instruction, p.instructions[index]);
    });
  }
});

test('contact diff keys ignore join role but preserve bit width and contact polarity', () => {
  for (const [load, and, negated, operands] of [
    ['BLD.D', 'BAND.D', 'BANB.D', ['DM9600', '#19']],
    ['LDWK', 'ANDWK', 'ANDWKB', ['MR9600']],
    ['LDCAL', 'ANDCAL', 'ANDCALB', ['"DM9600 > #23"']],
  ] as const) {
    assert.equal(keyenceContactKey(load, [...operands]), keyenceContactKey(and, [...operands]));
    assert.notEqual(
      keyenceContactKey(load, [...operands]),
      keyenceContactKey(negated, [...operands]),
    );
    const instruction = requireValue(program([`${load} ${operands.join(' ')}`]).instructions[0]);
    const difference = {
      kind: 'changed' as const,
      opChanged: true,
      operandChanges: [],
      otherText: [and, ...operands].join(' '),
    };
    instruction.difference = difference;
    assert.equal(keyenceSymbolDifferenceKind(instruction), undefined);
    difference.otherText = [negated, ...operands].join(' ');
    assert.equal(keyenceSymbolDifferenceKind(instruction), 'changed');
  }
  assert.notEqual(
    keyenceContactKey('BLD', ['DM9600', '#3']),
    keyenceContactKey('BLD.D', ['DM9600', '#3']),
  );
});

test('STG starts a stage contact and retains the following condition on its output', () => {
  const networks = buildKeyenceNetworks(
    program([
      'STP MR9400',
      'STG MR9401',
      'AND MR9402',
      'ENDS',
      'STG MR9403',
      'ANB MR9404',
      'JMP MR9405',
      'STE',
    ]),
  );
  assert.deepEqual(
    networks.map((n) => n.instructions.map((i) => i.opcode)),
    [['STP'], ['STG', 'AND', 'ENDS'], ['STG', 'ANB', 'JMP'], ['STE']],
  );
  assert.deepEqual(
    networks.map((n) => expression(requireValue(n.actions[0]).condition)),
    ['TRUE', '(MR9401 & MR9402)', '(MR9403 & !MR9404)', 'TRUE'],
  );
  const stage = requireValue(requireValue(networks[1]).actions[0]).condition!;
  assert.equal(stage.kind, 'and');
  if (stage.kind === 'and' && stage.left.kind === 'contact')
    assert.equal(stage.left.comparison, 'STG');
  assert.deepEqual(
    networks.flatMap((n) => n.warnings),
    [],
  );
});

test('three-input commands consume and preserve every independent condition', () => {
  for (const [command, names] of [
    ['SFT MR9500 MR9515', ['D', 'CLK', 'RES']],
    ['UDT #7 #321', ['UP', 'DW', 'RES']],
    ['UDC #8 #432', ['UP', 'DW', 'RES']],
    ['ITVL DM9500 MR9520', ['PLS', 'PAUSE', 'RES']],
    ['ITVL.S DM9501 MR9521', ['PLS', 'PAUSE', 'RES']],
    ['PID DM9502 MR9522', ['PAUSE', 'MANUAL', 'RES']],
  ] as const) {
    const p = program(['LD MR9501', 'AND MR9502', 'LD MR9503', 'OR MR9504', 'LD MR9505', command]);
    const before = structuredClone(p),
      networks = buildKeyenceNetworks(p),
      action = requireValue(requireValue(networks[0]).actions[0]);
    assert.deepEqual(
      action.inputConditions?.map((input) => input.name),
      names,
    );
    assert.deepEqual(
      action.inputConditions?.map((input) => expression(input.condition)),
      ['(MR9501 & MR9502)', '(MR9503 | MR9504)', 'MR9505'],
    );
    assert.equal(action.condition, action.inputConditions?.[0]?.condition);
    assert.deepEqual(
      networks.flatMap((n) => n.warnings),
      [],
      'consumed inputs must not produce an unjoined-block warning',
    );
    assert.deepEqual(
      networks.flatMap((n) => n.instructions),
      p.instructions,
    );
    assert.deepEqual(p, before);
  }
});

test('three-input commands preserve deeper logic blocks and diagnose missing inputs', () => {
  const [network] = buildKeyenceNetworks(
    program([
      'LD MR9800',
      'LD MR9801',
      'LD MR9802',
      'LD MR9803',
      'UDC #9 #543',
      'ANL',
      'OUT MR9899',
    ]),
  );
  assert.deepEqual(requireValue(network).warnings, []);
  assert.equal(
    expression(requireValue(requireValue(network).actions[1]).condition),
    '(MR9800 & MR9801)',
  );
  const missing = requireValue(
    buildKeyenceNetworks(program(['LD MR9804', 'SFT MR9805 MR9810']))[0],
  );
  assert.match(missing.warnings.join('\n'), /SFT.*D\/CLK\/RES.*不足/);
  assert.deepEqual(
    requireValue(missing.actions[0]).inputConditions?.map((input) => expression(input.condition)),
    ['TRUE', 'TRUE', 'MR9804'],
  );
});

test('independent control markers never inherit a preceding circuit condition', () => {
  for (const command of [
    'STP MR9900',
    'STE',
    'FOR #3',
    'FOR.D #123456',
    'NEXT',
    'LABEL #770',
    'SBN #771',
    'RET',
    'INT #772',
    'RETI',
    'MCR',
    'GOTO #773',
    'END',
    'ENDH',
  ]) {
    const p = program(['LD MR9901', 'OUT MR9902', command, 'LD MR9903', 'OUT MR9904']),
      networks = buildKeyenceNetworks(p);
    assert.equal(networks.length, 3, command);
    assert.equal(requireValue(networks[1]).instructions.length, 1, command);
    assert.equal(requireValue(requireValue(networks[1]).actions[0]).condition, null, command);
    assert.deepEqual(
      networks.flatMap((n) => n.instructions),
      p.instructions,
    );
    assert.deepEqual(
      networks.flatMap((n) => n.warnings),
      [],
    );
  }
});

test('conditional jump, call, return and break commands keep their input condition', () => {
  for (const command of ['CJ #780', 'NCJ #781', 'SCJ #782', 'CALL #783', 'RETURN', 'BREAK']) {
    const networks = buildKeyenceNetworks(program(['LD MR9701', command, 'OUT MR9702']));
    assert.equal(networks.length, 1, command);
    assert.equal(
      expression(requireValue(requireValue(networks[0]).actions[0]).condition),
      'MR9701',
      command,
    );
    assert.equal(
      requireValue(requireValue(networks[0]).actions[1]).condition,
      requireValue(requireValue(networks[0]).actions[0]).condition,
      command,
    );
  }
});

test('MC ends its circuit and MCR retains the matching sequential control number', () => {
  const p = program([
    'LD MR9201',
    'MC',
    'LD MR9202',
    'MC',
    'LD MR9203',
    'OUT MR9204',
    'MCR',
    'MCR',
    'LD MR9205',
    'MC',
    'MCR',
  ]);
  const before = structuredClone(p),
    networks = buildKeyenceNetworks(p),
    controls = networks
      .flatMap((n) => n.actions)
      .filter((a) => ['MC', 'MCR'].includes(a.instruction.opcode));
  assert.deepEqual(
    controls.map((a) => a.controlLevel),
    [0, 1, 1, 0, 2, 2],
  );
  assert.deepEqual(
    controls.map((a) => expression(a.condition)),
    ['MR9201', 'MR9202', 'TRUE', 'TRUE', 'MR9205', 'TRUE'],
  );
  assert.ok(networks.every((n) => n.actions.length === 1));
  assert.deepEqual(
    networks.flatMap((n) => n.warnings),
    [],
  );
  assert.deepEqual(
    networks.flatMap((n) => n.instructions),
    p.instructions,
  );
  assert.deepEqual(p, before);
});
