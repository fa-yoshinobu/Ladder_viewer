import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvBatch } from '../src/batch.ts';
import { parseKeyenceMnm } from '../src/keyence/parser.ts';
import { buildKeyenceNetworks } from '../src/keyence/logic.ts';
import { layoutKeyenceNetwork, keyenceViewDrawing } from '../src/keyence/layout.ts';
import { keyenceMacroGeometry } from '../src/keyence/macroGeometry.ts';
import { compareKeyencePrograms, keyenceComparisonDrawings } from '../src/keyence/comparison.ts';
import { unchangedDirectPair } from '../src/directComparison.ts';

// Original dummy source only; supplied project files never enter test fixtures.
const bytes = (text: string) => new TextEncoder().encode(text).buffer;
const mnm = (commands: string, module = 'DummyCaller', type = '0') =>
  bytes(`DEVICE:99\n;MODULE:${module}\n;MODULE_TYPE:${type}\n${commands}\nEND`);
const call = 'LD MR71\nMCALL DummyBound DM810 DM811 DM812';
const definition = 'LD CR71\nMOV P0 P1 ; Input  Lower\nMOV P0 P2 ; Input  Upper';
const linked = (definitionText = definition) =>
  parseCsvBatch([
    { name: 'caller.mnm', bytes: mnm(call) },
    { name: 'macro.mnm', bytes: mnm(definitionText, 'DummyBound', '1') },
  ]).keyencePrograms.find((p) => p.moduleName === 'DummyCaller')!;

test('MCALL links unique parameter labels from the same folder and retains original source', () => {
  const result = parseCsvBatch([
    { name: 'left/caller.mnm', bytes: mnm(call) },
    { name: 'right/caller.mnm', bytes: mnm(call) },
    { name: 'left/definition.mnm', bytes: mnm(definition, 'DummyBound', '1') },
    {
      name: 'right/definition.mnm',
      bytes: mnm(definition.replaceAll('Input', 'Feed'), 'DummyBound', '1'),
    },
  ]);
  assert.deepEqual(result.errors, []);
  const left = result.keyencePrograms.find((p) => p.name === 'left/caller.mnm')!;
  const right = result.keyencePrograms.find((p) => p.name === 'right/caller.mnm')!;
  assert.deepEqual(
    left.instructions[1].macro?.parameters.map((p) => p.name),
    ['Input', 'Lower', 'Upper'],
  );
  assert.deepEqual(
    right.instructions[1].macro?.parameters.map((p) => p.name),
    ['Feed', 'Lower', 'Upper'],
  );
  assert.equal(left.text, new TextDecoder().decode(mnm(call)));
  assert.equal(left.instructions[1].raw, call.split('\n')[1]);
  assert.deepEqual(left.instructions[1].operands, ['DummyBound', 'DM810', 'DM811', 'DM812']);
  assert.deepEqual(
    left.instructions.map((i) => i.opcode),
    ['LD', 'MCALL', 'END'],
  );
});

test('missing, conflicting or duplicate macro definitions retain P numbers', () => {
  const alone = parseKeyenceMnm(mnm(call), 'dummy.mnm');
  assert.deepEqual(
    alone.instructions[1].macro?.parameters.map((p) => p.name),
    ['P0', 'P1', 'P2'],
  );
  const conflict = linked(definition + '\nLD P0 ; Contradiction');
  assert.deepEqual(
    conflict.instructions[1].macro?.parameters.map((p) => p.name),
    ['P0', 'Lower', 'Upper'],
  );
  const duplicated = parseCsvBatch([
    { name: 'caller.mnm', bytes: mnm(call) },
    { name: 'macro-a.mnm', bytes: mnm(definition, 'DummyBound', '1') },
    { name: 'macro-b.mnm', bytes: mnm(definition, 'dummybound', '1') },
  ]).keyencePrograms.find((p) => p.moduleName === 'DummyCaller')!;
  assert.deepEqual(
    duplicated.instructions[1].macro?.parameters.map((p) => p.name),
    ['P0', 'P1', 'P2'],
  );
  const ordinary = linked(definition.replaceAll('  ', ' '));
  assert.deepEqual(
    ordinary.instructions[1].macro?.parameters.map((p) => p.name),
    ['P0', 'P1', 'P2'],
  );
});

test('MCALL keeps argument comments separate and preserves ambiguous overall annotations', () => {
  const separated = parseKeyenceMnm(mnm(call + ' ; Value  Low  High'), 'dummy.mnm');
  assert.deepEqual(separated.instructions[1].macro, {
    parameters: [
      { name: 'P0', comment: 'Value' },
      { name: 'P1', comment: 'Low' },
      { name: 'P2', comment: 'High' },
    ],
  });
  const p = parseKeyenceMnm(mnm(call + ' ; This is one general note'), 'dummy.mnm', {
    DM810: 'External input',
    DM811: 'External lower',
  });
  assert.equal(p.instructions[1].macro?.comment, 'This is one general note');
  assert.deepEqual(
    p.instructions[1].macro?.parameters.map((p) => p.comment),
    ['External input', 'External lower', ''],
  );
  const one = parseKeyenceMnm(mnm('MCALL DummyOne DM821 ; Single argument note'), 'dummy.mnm');
  assert.equal(one.instructions[0].macro?.parameters[0].comment, 'Single argument note');
});

test('macro headers and comments fit their rows in wrapped and scrolling drawings', () => {
  const p = parseKeyenceMnm(
    mnm(
      'LD MR82\nMCALL DummyBound DM820 DM821 DM822 ; A general annotation below the argument comments\nOUT MR83',
    ),
    'dummy.mnm',
    {
      DM820: 'Invented long input annotation for wrapping',
      DM821: 'Invented long lower annotation for wrapping',
    },
  );
  for (const showComments of [false, true])
    for (const mode of ['wrap', 'scroll'] as const) {
      const d = keyenceViewDrawing(
        layoutKeyenceNetwork(buildKeyenceNetworks(p)[0], p, showComments),
        mode,
      );
      const macro = d.symbols.find((s) => s.instruction.opcode === 'MCALL')!,
        next = d.symbols.find((s) => s.instruction.opcode === 'OUT')!;
      const geometry = keyenceMacroGeometry(macro.instruction, showComments);
      assert.ok(macro.y + geometry.top >= d.headerHeight);
      assert.ok(macro.y + geometry.bottom < next.y - d.baseline + 4);
      assert.ok(macro.height! >= d.baseline + geometry.bottom - 4);
      assert.equal(macro.showComments, showComments);
      assert.ok(
        [d.width, d.height, ...d.symbols.flatMap((s) => [s.x, s.y, s.width])].every(
          Number.isFinite,
        ),
      );
    }
});

test('macro argument and label changes remain visible to comparison and unchanged filtering', () => {
  const a = linked(),
    b = linked(definition.replaceAll('Input', 'Feed'));
  assert.equal(compareKeyencePrograms(a, a).changes.length, 0);
  const compared = compareKeyencePrograms(a, b);
  assert.equal(compared.changes.length, 1);
  assert.equal(compared.changes[0].source?.opcode, 'MCALL');
  assert.equal(
    unchangedDirectPair({
      id: 'dummy',
      label: 'dummy',
      source: { format: 'keyence', name: a.name, program: a },
      target: { format: 'keyence', name: b.name, program: b },
    }),
    false,
  );
  const changed = parseKeyenceMnm(mnm(call.replace('DM811', 'DM819')), 'changed.mnm');
  const values = compareKeyencePrograms(parseKeyenceMnm(mnm(call), 'before.mnm'), changed);
  assert.deepEqual(values.changes[0].source?.difference?.operandChanges, [2]);
  for (const mode of ['wrap', 'scroll'] as const)
    for (const group of keyenceComparisonDrawings(values, true, mode))
      for (const d of [...group.source, ...group.target]) {
        assert.ok(
          [d.height, ...d.symbols.flatMap((s) => [s.x, s.y, s.width])].every(Number.isFinite),
        );
      }
});

test('a macro inserted on either side keeps matching contacts vertically aligned', () => {
  const plain = parseKeyenceMnm(mnm('LD MR91\nOUT MR92'), 'plain.mnm');
  const macro = parseKeyenceMnm(
    mnm('LD MR91\nMCALL DummyOnly #7 #8 ; Input  Limit\nOUT MR92'),
    'macro.mnm',
  );
  for (const [source, target] of [
    [plain, macro],
    [macro, plain],
  ])
    for (const comments of [false, true])
      for (const mode of ['wrap', 'scroll'] as const) {
        const group = keyenceComparisonDrawings(
          compareKeyencePrograms(source, target),
          comments,
          mode,
        )[0];
        const locations = (side: typeof group.source) => {
          let offset = 0;
          const result = new Map<string, number>();
          for (const d of side) {
            for (const s of d.symbols)
              if (s.instruction.opcode === 'LD')
                result.set(s.instruction.operands[0], offset + s.y);
            offset += d.height;
          }
          return result;
        };
        assert.deepEqual(locations(group.source), locations(group.target));
        const d = [...group.source, ...group.target].find((d) =>
          d.symbols.some((s) => s.instruction.macro),
        )!;
        const s = d.symbols.find((s) => s.instruction.macro)!;
        assert.ok(s.y + keyenceMacroGeometry(s.instruction, comments).top >= d.headerHeight);
        assert.ok(s.y + keyenceMacroGeometry(s.instruction, comments).bottom < d.height);
      }
});
