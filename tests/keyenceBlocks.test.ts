import test from 'node:test';
import assert from 'node:assert/strict';
import { parseKeyenceMnm } from '../src/keyence/parser.ts';
import { buildKeyenceNetworks } from '../src/keyence/logic.ts';
import { layoutKeyenceNetwork } from '../src/keyence/layout.ts';
import { compareKeyencePrograms } from '../src/keyence/comparison.ts';
import { keyenceInstructionCopyText } from '../src/keyence/instructionCopy.ts';
import { projectKeyenceInstruction } from '../src/keyence/compareDrawing.tsx';

const parse = (commands: string[]) =>
  parseKeyenceMnm(
    new TextEncoder().encode(['DEVICE:99', ';MODULE:Synthetic', ...commands].join('\n')).buffer,
    'Synthetic.mnm',
  );
const scriptCommands = [
  ';DM1 = 2',
  ';DM2 = 3',
  'LD CR2002',
  'NCJ #1000',
  'LD CR2002',
  'MOV #2 DM1',
  'LD CR2002',
  'MOV #3 DM2',
  'LABEL #1000',
  'END',
];

for (const opcode of ['FB', 'FUN'])
  test(opcode + ' uses only MNM names and every argument in a vertical block', () => {
    const p = parse(['LD MR1', opcode + ' Sample DM1 #2 DM3', 'END']),
      network = buildKeyenceNetworks(p)[0];
    const fb = p.instructions[1].fb!;
    assert.equal(fb.name, 'Sample');
    assert.deepEqual(
      fb.pins.map((pin) => [pin.name, pin.value]),
      [
        ['引数1', 'DM1'],
        ['引数2', '#2'],
        ['引数3', 'DM3'],
      ],
    );
    const drawing = layoutKeyenceNetwork(network, p),
      symbol = drawing.symbols.find((s) => s.kind === 'fb')!;
    assert.ok(symbol.blockRows! > 1);
    assert.equal(symbol.width, 6 * 74);
    assert.match(keyenceInstructionCopyText(p.instructions[1], p), /引数3: DM3/);
  });

test('MNM script comments and expanded commands remain visible and copyable without supplemental files', () => {
  const p = parse(scriptCommands),
    networks = buildKeyenceNetworks(p);
  assert.deepEqual(
    networks.flatMap((n) => n.instructions).map((i) => i.raw),
    p.instructions.map((i) => i.raw),
  );
  const symbols = networks.flatMap((n) => layoutKeyenceNetwork(n, p).symbols);
  for (const op of ['NCJ', 'MOV', 'LABEL'])
    assert.ok(
      symbols.some((s) => s.instruction.opcode === op),
      op,
    );
  assert.match(networks[0].statement, /DM1 = 2\nDM2 = 3/);
  const move = p.instructions.find((i) => i.opcode === 'MOV')!;
  assert.match(keyenceInstructionCopyText(move, p), /MOV #2 DM1/);
  const projected = projectKeyenceInstruction(p.instructions[0], p);
  assert.match(projected.statement, /DM2 = 3/);
});

test('MNM-only comparisons detect expanded script and FB argument changes without mutating the inputs', () => {
  const source = parse(scriptCommands),
    target = parse(scriptCommands.map((s) => (s === 'MOV #3 DM2' ? 'MOV #4 DM2' : s)));
  const before = structuredClone(source),
    comparison = compareKeyencePrograms(source, target);
  assert.equal(comparison.changes.length, 1);
  assert.equal(comparison.changes[0].target?.opcode, 'MOV');
  assert.deepEqual(source, before);
  const fb = compareKeyencePrograms(
    parse(['LD MR1', 'FB Sample DM1 DM2', 'END']),
    parse(['LD MR1', 'FB Sample DM1 DM3', 'END']),
  );
  assert.equal(fb.changes.length, 1);
  assert.deepEqual(fb.changes[0].target?.difference?.operandChanges, [2]);
});
