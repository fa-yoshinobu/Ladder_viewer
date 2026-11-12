import { requireValue } from '../src/requireValue';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProgram, type Instruction, type Program } from '../src/model.ts';
import { comparisonDisplayProgram } from '../src/comparisonDisplay.ts';

function syntheticProgram(prefix: string): Program {
  const instructions: Instruction[] = [
    ['LD', 'X11'],
    ['OUT', 'Y21'],
  ].map(([op, operand], index) => ({
    id: prefix + '-' + index,
    sourceRow: index + 3,
    step: String(index),
    op: requireValue(op),
    operands: [requireValue(operand)],
    note: 'synthetic note',
    statement: '',
  }));
  return buildProgram(instructions, 'synthetic.csv', 'SYNTHETIC CPU');
}
function comparison(): Program {
  const source = syntheticProgram('source'),
    target = syntheticProgram('target');
  requireValue(source.networks[0]).rowAlignment = [0, 4];
  requireValue(target.networks[0]).rowAlignment = [1, 5];
  source.comparison = {
    target,
    sourceProject: 'before',
    targetProject: 'after',
    sourceName: 'LEFT',
    targetName: 'RIGHT',
    differentRows: 0,
    rowCount: 2,
    changes: [],
    shiftedSteps: 0,
  };
  return source;
}

test('single-side display drops only row alignment without mutating either original program', () => {
  const source = comparison(),
    target = source.comparison!.target;
  for (const side of ['source', 'target'] as const) {
    const original = side === 'source' ? source : target,
      network = requireValue(original.networks[0]),
      alignment = [...network.rowAlignment!];
    Object.freeze(network.rowAlignment);
    Object.freeze(network);
    Object.freeze(original.networks);
    Object.freeze(original);
    const displayed = comparisonDisplayProgram(source, side);
    assert.notEqual(displayed, original);
    assert.notEqual(displayed.networks, original.networks);
    assert.notEqual(displayed.networks[0], network);
    assert.equal(Object.hasOwn(requireValue(displayed.networks[0]), 'rowAlignment'), false);
    assert.deepEqual(network.rowAlignment, alignment);
    assert.equal(displayed.instructions, original.instructions);
    assert.equal(requireValue(displayed.networks[0]).instructions, network.instructions);
    assert.equal(requireValue(displayed.networks[0]).actions, network.actions);
    assert.equal(displayed.name, original.name);
    assert.equal(displayed.cpu, original.cpu);
  }
  assert.deepEqual(requireValue(source.networks[0]).rowAlignment, [0, 4]);
  assert.deepEqual(requireValue(target.networks[0]).rowAlignment, [1, 5]);
});

test('single-side copies retain master, control, difference and source metadata by reference', () => {
  const source = comparison(),
    network = requireValue(source.networks[0]),
    instruction = requireValue(network.instructions[0]);
  const header: Instruction = {
    ...instruction,
    id: 'synthetic-master',
    op: 'MC',
    operands: ['N2', 'M81'],
  };
  network.masterControl = header;
  network.masterControlRanges = [
    { start: header, end: network.instructions[1], level: 2, lane: 0 },
  ];
  network.controlRanges = [
    { kind: 'IF', start: instruction, end: network.instructions[1], lane: 0, branches: [] },
  ];
  network.connectionDifferences = {
    kind: 'removed',
    wires: [0],
    inputs: [instruction.id],
    outputs: [],
  };
  instruction.controlFlow = {
    kind: 'jump',
    label: 'synthetic jump',
    targetId: requireValue(network.instructions[1]).id,
    targetStep: '1',
  };
  instruction.difference = {
    kind: 'changed',
    opChanged: false,
    operandChanges: [0],
    otherText: 'LD X12',
    otherStep: '0',
  };
  const displayed = comparisonDisplayProgram(source, 'source'),
    copy = requireValue(displayed.networks[0]);
  assert.equal(displayed.comparison, source.comparison);
  assert.equal(displayed.warnings, source.warnings);
  assert.equal(copy.masterControl, header);
  assert.equal(copy.masterControlRanges, network.masterControlRanges);
  assert.equal(copy.controlRanges, network.controlRanges);
  assert.equal(copy.connectionDifferences, network.connectionDifferences);
  assert.equal(copy.warnings, network.warnings);
  assert.equal(requireValue(copy.instructions[0]).controlFlow, instruction.controlFlow);
  assert.equal(requireValue(copy.instructions[0]).difference, instruction.difference);
  assert.equal(requireValue(copy.instructions[0]).sourceRow, 3);
});

test('both-side and ordinary CSV displays retain the original program and its geometry', () => {
  const source = comparison();
  assert.equal(comparisonDisplayProgram(source, 'both'), source);
  assert.deepEqual(requireValue(source.networks[0]).rowAlignment, [0, 4]);
  const ordinary = syntheticProgram('ordinary');
  for (const display of ['both', 'source', 'target'] as const)
    assert.equal(comparisonDisplayProgram(ordinary, display), ordinary);
});
