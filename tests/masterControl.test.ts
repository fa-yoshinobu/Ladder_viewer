import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProgram, type Instruction, type Network } from '../src/model.ts';
import { gridLayout } from '../src/layout.ts';

const program = (commands: string[]) =>
  buildProgram(
    commands.map((command, index): Instruction => {
      const [op, ...operands] = command.split(' ');
      return {
        id: `synthetic-${index}`,
        sourceRow: index + 1,
        step: String(index),
        op,
        operands,
        note: '',
        statement: '',
      };
    }),
    'synthetic-master-control',
  );
const scope = (network: Network) => network.masterControlRanges ?? [];
const uniqueRanges = (networks: Network[]) => [...new Set(networks.flatMap(scope))];

test('one MC range crosses multiple rungs and ends at its matching MCR', () => {
  const p = program([
    'LD X0',
    'MC N0 M0',
    'LD X1',
    'OUT Y1',
    'LD X2',
    'OUT Y2',
    'MCR N0',
    'LD X3',
    'OUT Y3',
  ]);
  const [range] = uniqueRanges(p.networks);
  assert.equal(range.start, p.instructions[1]);
  assert.equal(range.end, p.instructions[6]);
  assert.equal(range.level, 0);
  assert.equal(range.lane, 0);
  for (const instruction of p.instructions.slice(0, 7)) {
    const n = p.networks.find((n) => n.instructions.includes(instruction))!;
    assert.ok(scope(n).includes(range));
  }
  const after = p.networks.find((n) => n.instructions.includes(p.instructions[7]))!;
  assert.deepEqual(scope(after), []);
  assert.equal(
    p.networks.find((n) => n.instructions.includes(p.instructions[2]))!.masterControl,
    p.instructions[1],
    'the existing one-header metadata is retained',
  );
  assert.deepEqual(
    p.networks.flatMap((n) => n.warnings),
    [],
  );
  assert.doesNotThrow(() => JSON.stringify(p), 'instruction references create no cycle');
});

test('nested MC ranges have separate lanes and an inner MCR leaves the outer range active', () => {
  const p = program([
    'LD X0',
    'MC N0 M0',
    'LD X1',
    'MC N1 M1',
    'LD X2',
    'OUT Y2',
    'MCR N1',
    'LD X3',
    'OUT Y3',
    'MCR N0',
  ]);
  const [outer, inner] = uniqueRanges(p.networks);
  assert.deepEqual([outer.level, outer.lane, inner.level, inner.lane], [0, 0, 1, 1]);
  assert.equal(inner.end, p.instructions[6]);
  assert.equal(outer.end, p.instructions[9]);
  const middle = p.networks.find((n) => n.instructions.includes(p.instructions[7]))!;
  assert.deepEqual(scope(middle), [outer]);
  const closing = p.networks.find((n) => n.instructions.includes(p.instructions[6]))!;
  assert.deepEqual(scope(closing), [outer, inner]);
  assert.deepEqual(
    p.networks.flatMap((n) => n.warnings),
    [],
  );
});

test('an outer MCR closes all active inner levels with the same original end instruction', () => {
  const p = program(['MC N0 M0', 'LD X1', 'MC N2 M2', 'LD X2', 'OUT Y2', 'MCR N0']);
  const ranges = uniqueRanges(p.networks);
  assert.deepEqual(
    ranges.map((range) => [range.level, range.lane]),
    [
      [0, 0],
      [2, 1],
    ],
  );
  assert.ok(ranges.every((range) => range.end === p.instructions[5]));
  assert.deepEqual(p.networks.at(-1)!.masterControlRanges, ranges);
  assert.deepEqual(
    p.networks.flatMap((n) => n.warnings),
    [],
  );
});

test('separate ranges may reuse a level and lane after the earlier range closes', () => {
  const p = program([
    'MC N0 M0',
    'LD X0',
    'OUT Y0',
    'MCR N0',
    'MC N0 M1',
    'LD X1',
    'OUT Y1',
    'MCR N0',
  ]);
  const ranges = uniqueRanges(p.networks);
  assert.equal(ranges.length, 2);
  assert.notEqual(ranges[0], ranges[1]);
  assert.deepEqual(
    ranges.map((range) => [range.level, range.lane]),
    [
      [0, 0],
      [0, 0],
    ],
  );
  assert.equal(ranges[0].end, p.instructions[3]);
  assert.equal(ranges[1].end, p.instructions[7]);
  assert.deepEqual(
    p.networks.flatMap((n) => n.warnings),
    [],
  );
});

test('invalid N operands and unmatched MCR commands remain intact and produce warnings without invented ranges', () => {
  const commands = [
    'MC Nbad M0',
    'LD X0',
    'OUT Y0',
    'MCR N0',
    'MC N-1 M1',
    'MCR',
    'MC N9007199254740992 M2',
    'MC N15 M3',
  ];
  const p = program(commands);
  assert.deepEqual(
    p.instructions.map((i) => [i.op, ...i.operands].join(' ')),
    commands,
  );
  assert.deepEqual(uniqueRanges(p.networks), []);
  const warnings = p.networks.flatMap((n) => n.warnings);
  assert.equal(warnings.length, 6);
  assert.ok(warnings.some((w) => w.includes('解除対象')));
  assert.equal(warnings.filter((w) => w.includes('N0～N14')).length, 5);
});

test('an unclosed MC remains open through the final network and warns at its start', () => {
  const p = program(['LD X0', 'MC N0 M0', 'LD X1', 'OUT Y1', 'LD X2', 'OUT Y2']);
  const [range] = uniqueRanges(p.networks);
  assert.equal(range.end, undefined);
  assert.ok(scope(p.networks.at(-1)!).includes(range));
  const start = p.networks.find((n) => n.instructions.includes(range.start))!;
  assert.ok(start.warnings.some((w) => w.includes('対応するMCRがありません')));
});

test('same-level and decreasing active MC starts warn without creating false scopes or colliding lanes', () => {
  const p = program([
    'MC N1 M1',
    'LD X0',
    'MC N1 M2',
    'LD X1',
    'MC N0 M3',
    'LD X2',
    'OUT Y2',
    'MCR N1',
  ]);
  const ranges = uniqueRanges(p.networks);
  assert.equal(ranges.length, 1);
  assert.equal(ranges[0].start, p.instructions[0]);
  assert.equal(ranges[0].end, p.instructions[7]);
  assert.equal(
    p.networks.flatMap((n) => n.warnings).filter((w) => w.includes('未対応のネスト順')).length,
    2,
  );
  assert.equal(p.instructions.filter((i) => i.op === 'MC').length, 3);
});

test('MC adds a header row to the next rung and MCR closes that boundary', () => {
  const p = program([
    'LD X171',
    'MC N3 M9671',
    'LD X172',
    'OUT Y172',
    'MCR N3',
    'LD X173',
    'OUT Y173',
  ]);
  assert.deepEqual(
    p.networks.map((network) => network.actions.map((action) => action.instruction.op)),
    [['MC'], ['OUT'], ['MCR'], ['OUT']],
  );
  const controlled = p.networks[1],
    reset = p.networks[2],
    after = p.networks[3];
  assert.equal(
    controlled.masterControl,
    p.instructions.find((instruction) => instruction.op === 'MC'),
  );
  assert.deepEqual(controlled.masterControl?.operands, ['N3', 'M9671']);
  assert.equal(reset.masterControl, undefined);
  assert.equal(after.masterControl, undefined);
  assert.equal(reset.actions[0].condition, null);
  const grid = gridLayout(controlled);
  assert.ok(grid.symbols.every((symbol) => symbol.row >= 1));
  assert.equal(grid.rows, 2);
  assert.ok(gridLayout(after).symbols.every((symbol) => symbol.row === 0));
  assert.deepEqual(
    p.networks.flatMap((network) => network.instructions).map((instruction) => instruction.id),
    p.instructions.map((instruction) => instruction.id),
  );
  assert.deepEqual(
    p.networks.flatMap((network) => network.warnings),
    [],
  );
});
