import test from 'node:test';
import assert from 'node:assert/strict';
import { parseKeyenceMnm } from '../src/keyence/parser.ts';
import { buildKeyenceNetworks } from '../src/keyence/logic.ts';
import { keyenceInstructionCopyText } from '../src/keyence/instructionCopy.ts';

// All circuit values and ST source below are independently invented dummy data.
const parse = (lines: string[]) =>
  parseKeyenceMnm(
    new TextEncoder().encode(['DEVICE:60', ...lines].join('\n')).buffer,
    'dummy-kvx-regions.mnm',
  );

test('BOX_ST owns its exact source and remains an output of the preceding circuit condition', () => {
  const body = [';\tuiDummy := 67;', ';', ";\tsDummy := 'part;two';"];
  const p = parse(['LD R9730', 'ANB MR9731', 'BOX_ST', ...body, 'LD R9732', 'OUT MR9733']),
    before = structuredClone(p);
  const networks = buildKeyenceNetworks(p),
    box = p.instructions[2];
  assert.deepEqual(
    networks.map((n) => n.instructions.map((i) => i.opcode)),
    [
      ['LD', 'ANB', 'BOX_ST'],
      ['LD', 'OUT'],
    ],
  );
  assert.equal(networks[0].actions[0].instruction, box);
  assert.equal(networks[0].actions[0].condition?.kind, 'and');
  assert.deepEqual(
    box.st?.lines,
    body.map((raw, index) => ({ sourceLine: index + 5, raw, text: raw.slice(1) })),
  );
  assert.equal(box.sourceLine, 4);
  assert.equal(box.sourceEndLine, 7);
  assert.equal(box.raw, 'BOX_ST');
  assert.equal(
    keyenceInstructionCopyText(box, p),
    "\tuiDummy := 67;\r\n\r\n\tsDummy := 'part;two';",
  );
  assert.deepEqual(p.comments, []);
  assert.equal(p.instructions[3].statement, '');
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

test('BOX_ST participates in saved branches without resetting the shared condition', () => {
  const p = parse([
    'LD R9740',
    'MPS',
    'AND R9741',
    'BOX_ST',
    ';uiDummy := 79;',
    'MPP',
    'OUT MR9742',
  ]);
  const networks = buildKeyenceNetworks(p),
    [box, out] = networks[0].actions;
  assert.equal(networks.length, 1);
  assert.equal(box.instruction.opcode, 'BOX_ST');
  assert.equal(out.instruction.opcode, 'OUT');
  assert.equal(box.condition?.kind, 'and');
  if (box.condition?.kind === 'and') assert.equal(box.condition.left, out.condition);
  assert.deepEqual(networks[0].warnings, []);
});

test('disabled markers bound complete circuits while every original instruction stays in order', () => {
  const p = parse([
    'LD R9750',
    'OUT MR9751',
    'DISABLED_RUNG',
    'LD R9752',
    'OUT MR9753',
    'LD R9754',
    'SET MR9755',
    'END_DISABLED_RUNG',
    'LD R9756',
    'OUT MR9757',
  ]);
  const before = structuredClone(p),
    networks = buildKeyenceNetworks(p);
  assert.deepEqual(
    networks.map((n) => n.instructions.map((i) => i.opcode)),
    [
      ['LD', 'OUT'],
      ['DISABLED_RUNG', 'LD', 'OUT'],
      ['LD', 'SET', 'END_DISABLED_RUNG'],
      ['LD', 'OUT'],
    ],
  );
  assert.deepEqual(
    networks.map((n) => n.disabled),
    [undefined, true, true, undefined],
  );
  assert.deepEqual(
    p.instructions.map((i) => !!i.disabled),
    [false, false, true, true, true, true, true, true, false, false],
  );
  assert.deepEqual(
    networks.flatMap((n) => n.actions).map((a) => a.instruction.opcode),
    ['OUT', 'OUT', 'SET', 'OUT'],
  );
  for (const network of networks) assert.equal(network.actions[0].condition?.kind, 'contact');
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

test('disabled boxed ST stays visible in the model and copies its original source', () => {
  const p = parse([
    'RUNG_COMMENT',
    ';Dummy inactive circuit',
    'disabled_rung',
    'LD R9760',
    'BOX_ST',
    ';\tuiDummy := 83;',
    'end_disabled_rung',
    'LD R9761',
    'OUT MR9762',
  ]);
  const networks = buildKeyenceNetworks(p),
    disabled = networks.find((n) => n.disabled)!;
  assert.equal(disabled.actions.length, 1);
  const box = disabled.actions[0].instruction;
  assert.equal(box.opcode, 'BOX_ST');
  assert.equal(box.disabled, true);
  assert.equal(keyenceInstructionCopyText(box, p), '\tuiDummy := 83;');
  assert.equal(disabled.actions[0].condition?.kind, 'contact');
  assert.equal(networks[0].statement, 'Dummy inactive circuit');
  assert.equal(networks.at(-1)?.disabled, undefined);
  assert.deepEqual(
    networks.flatMap((n) => n.warnings),
    [],
  );
  assert.deepEqual(
    networks.flatMap((n) => n.instructions),
    p.instructions,
  );
});

test('nested disabled boundaries restore the outer state without changing source values', () => {
  const p = parse([
    'DISABLED_RUNG',
    'LD R9770',
    'OUT MR9771',
    'DISABLED_RUNG',
    'LD R9772',
    'OUT MR9773',
    'END_DISABLED_RUNG',
    'LD R9774',
    'OUT MR9775',
    'END_DISABLED_RUNG',
    'LD R9776',
    'OUT MR9777',
  ]);
  assert.deepEqual(
    p.instructions.filter((i) => i.opcode === 'LD').map((i) => [i.operands[0], !!i.disabled]),
    [
      ['R9770', true],
      ['R9772', true],
      ['R9774', true],
      ['R9776', false],
    ],
  );
  assert.deepEqual(
    buildKeyenceNetworks(p).flatMap((n) => n.instructions),
    p.instructions,
  );
});

test('EOF without END does not create a phantom ST row from the final line terminator', () => {
  for (const newline of ['\n', '\r\n', '\r'])
    for (const opcode of ['AREA_ST', 'BOX_ST']) {
      const text = ['DEVICE:60', opcode, ';\tuiDummy := 97;', ''].join(newline);
      const p = parseKeyenceMnm(new TextEncoder().encode(text).buffer, 'dummy-freeformed.mnm'),
        i = p.instructions[0];
      assert.equal(p.text, text);
      assert.equal(p.instructions.length, 1);
      assert.deepEqual(i.st?.lines, [
        { sourceLine: 3, raw: ';\tuiDummy := 97;', text: '\tuiDummy := 97;' },
      ]);
      assert.equal(i.sourceEndLine, 3);
      assert.equal(keyenceInstructionCopyText(i, p), '\tuiDummy := 97;');
    }
  const text = 'DEVICE:60\nAREA_ST\n;uiDummy := 101;\n;\n\n';
  const p = parseKeyenceMnm(new TextEncoder().encode(text).buffer, 'dummy-blank-lines.mnm');
  assert.deepEqual(
    p.instructions[0].st?.lines.map((line) => line.text),
    ['uiDummy := 101;', '', ''],
  );
  assert.equal(
    p.instructions[0].sourceEndLine,
    5,
    'intentional empty source rows must be retained',
  );
});

test('AREA_ST remains independent when adjacent BOX_ST uses a ladder condition', () => {
  const p = parse(['AREA_ST', ';uiDummy := 103;', 'LD R9780', 'BOX_ST', ';uiDummy := 107;', 'END']);
  const networks = buildKeyenceNetworks(p);
  assert.deepEqual(
    networks.map((n) => n.instructions.map((i) => i.opcode)),
    [['AREA_ST'], ['LD', 'BOX_ST'], ['END']],
  );
  assert.equal(networks[0].actions[0].condition, null);
  assert.equal(networks[1].actions[0].condition?.kind, 'contact');
  assert.deepEqual(
    networks.flatMap((n) => n.warnings),
    [],
  );
});
