import test from 'node:test';
import assert from 'node:assert/strict';
import { parseComparison } from '../src/comparison.ts';
import { gridLayout } from '../src/layout.ts';
import { symbolDifferenceKind, type Program, type Network } from '../src/model.ts';
import { comparisonDisplayProgram } from '../src/comparisonDisplay.ts';
import { compareConnections } from '../src/connections.ts';
import { compareConnectionGraphs, type ConnectionInput } from '../src/connectionGraph.ts';
const csv = (source: string[], target: string[]) =>
  [
    ['行', 'ステップ', '照合元', 'ステップ', '照合先', '照合結果'],
    ...Array.from({ length: Math.max(source.length, target.length) }, (_, i) => [
      String(i + 1),
      source[i] ? String(i) : '',
      source[i] ?? '',
      target[i] ? String(i) : '',
      target[i] ?? '',
      '不一致',
    ]),
  ]
    .map((row) => row.map((value) => '"' + value.replaceAll('"', '""') + '"').join('\t'))
    .join('\n');
const marked = (program: Program) =>
  program.networks.flatMap((n) => gridLayout(n).wires.filter((w) => w.difference));

test('the same contact stays uncolored when a parallel branch becomes a series connection', () => {
  const p = parseComparison(
    csv(
      ['LD X4', 'LDI X0', 'OR M6', 'ANB', 'AND X1', 'OUT Y0'],
      ['LD X4', 'ANI X0', 'AND X1', 'OUT Y0'],
    ),
    'contact',
  );
  for (const side of [p, p.comparison!.target]) {
    const contact = side.instructions.find((i) => i.operands[0] === 'X0')!;
    assert.equal(
      contact.difference?.kind,
      'changed',
      'raw instruction changes remain available in details',
    );
    assert.equal(symbolDifferenceKind(contact), undefined);
    assert.ok(
      side.networks.some((n) => {
        const grid = gridLayout(n);
        return (
          grid.wires.some((w) => w.difference) ||
          grid.symbols.some((s) => s.inputDifference || s.outputDifference)
        );
      }),
      'connection changes remain colored',
    );
  }
  const original = p.instructions.find((i) => i.operands[0] === 'X0')!;
  for (const otherText of ['AND X0', 'ANDP X0', 'ANI X1', 'ANI X0 K1', 'OUT X0'])
    assert.equal(
      symbolDifferenceKind({ ...original, difference: { ...original.difference!, otherText } }),
      'changed',
      otherText,
    );
  const branch = p.instructions.find((i) => i.operands[0] === 'M6')!;
  assert.equal(symbolDifferenceKind(branch), 'removed');
});

test('a shared OR merge removed from the output conditions marks its actual junction wires', () => {
  const source = ['LDI B400', 'LD Y0E1', 'MEP', 'ORB', 'OUT X71', 'SET X0A8'];
  const target = ['LDI B400', 'OUT X71', 'LD Y0E1', 'MEP', 'SET X0A8'];
  const p = parseComparison(csv(source, target), 'branch');
  const g = gridLayout(p.networks[0]);
  const vertical = g.wires.find((w) => w.x1 === 2 && w.x2 === 2 && w.y1 !== w.y2);
  assert.equal(vertical?.difference, 'removed');
  assert.ok(g.wires.some((w) => w.x1 === 2 && w.x2 === 10 && w.difference === 'removed'));
  assert.ok(marked(p.comparison!.target).some((w) => w.difference === 'added'));
  for (const side of [p, p.comparison!.target]) {
    const edge = side.networks
      .flatMap((n) => gridLayout(n).symbols)
      .find((s) => s.instruction.op === 'MEP')!;
    assert.equal(edge.inputDifference, undefined, 'Y0E1 to MEP remains the same direct connection');
  }
});

test('insertion and row padding do not color unchanged existing branch connections', () => {
  const a = ['LD X0', 'MPS', 'AND X1', 'OUT Y1', 'MPP', 'AND X2', 'OUT Y2'];
  const b = [
    'LD X0',
    'MPS',
    'AND X1',
    'OUT Y1',
    'MRD',
    'AND X9',
    'OUT Y9',
    'MPP',
    'AND X2',
    'OUT Y2',
  ];
  const p = parseComparison(csv(a, b), 'insert');
  // Adding a branch to the shared X0 output changes that junction, but the existing AND-to-OUT paths remain unchanged.
  for (const side of [p, p.comparison!.target])
    for (const symbol of side.networks
      .flatMap((n) => gridLayout(n).symbols)
      .filter(
        (s) => s.instruction.op === 'OUT' && ['Y1', 'Y2'].includes(s.instruction.operands[0]),
      ))
      assert.equal(symbol.inputDifference, undefined);
});

test('steps, layout gaps and operand-only edits do not invent a connection change', () => {
  const p = parseComparison(
    csv(['LD X0', 'AND X1', 'OUT Y0'], ['LD X0', 'AND X2', 'OUT Y0']),
    'operand',
  );
  assert.equal(marked(p).length, 0);
  assert.equal(marked(p.comparison!.target).length, 0);
  const same = parseComparison(
    csv(
      ['LD X0', 'OUT Y0', 'LD X1', 'OUT Y1'],
      ['LD X9', 'OUT Y9', 'LD X0', 'OUT Y0', 'LD X1', 'OUT Y1'],
    ),
    'gap',
  );
  assert.equal(marked(same).length, 0);
  for (const symbol of same.networks.flatMap((n) => gridLayout(n).symbols))
    assert.ok(!symbol.inputDifference && !symbol.outputDifference);
});

test('a new independent rung colors its branch, not the existing mother rail terminals', () => {
  const p = parseComparison(
    csv(['LD X0', 'OUT Y0'], ['LD X0', 'OUT Y0', 'LD X9', 'OUT Y9']),
    'new',
  );
  const existing = gridLayout(p.comparison!.target.networks[0]);
  assert.ok(existing.symbols.every((s) => !s.inputDifference && !s.outputDifference));
  assert.ok(existing.wires.every((w) => !w.difference));
  const added = gridLayout(p.comparison!.target.networks[1]);
  assert.ok(added.wires.some((w) => w.difference === 'added'));
  assert.equal(added.symbols.find((s) => s.instruction.op === 'LD')?.inputDifference, 'added');
});

test('single-side wire colors use natural spans after output alignment re-routes a shared junction', () => {
  const common = ['LD X0', 'LD<= R0 D0', 'OR>= R1 D1', 'ANB', 'OR M10'];
  const suffix = ['AND X90', 'MPS', 'ANI M10', 'MOV K1 D100', 'MPP'];
  const a = [...common, 'ANI X80', 'ANI X81', ...suffix, 'OUT M100', 'OUT M10'];
  const b = [...common, ...suffix, 'OUT M10'];
  for (const reverse of [false, true]) {
    const p = parseComparison(
      csv(reverse ? b : a, reverse ? a : b),
      'synthetic-natural-wire-colors',
    );
    const sides = (['source', 'target'] as const).map((side) => comparisonDisplayProgram(p, side));
    const actual = sides.map((program) => gridLayout(program.networks[0]));
    const expected: Network[][] = sides.map((program) =>
      program.networks.map((n) => ({ ...n, connectionDifferences: undefined })),
    );
    compareConnections(expected[0], expected[1]);
    for (const [side, grid] of actual.entries())
      assert.deepEqual(
        grid.wires.flatMap((w, index) => (w.difference ? [index] : [])),
        expected[side][0].connectionDifferences!.wires,
      );
  }
});

test('a multi-junction connection graph remains unchanged when columns and rows are spread apart', () => {
  const source: ConnectionInput = {
    railX: 0,
    wires: [
      { x1: 0, y1: 0, x2: 1, y2: 0 },
      { x1: 2, y1: 0, x2: 5, y2: 0 },
      { x1: 2, y1: 0, x2: 2, y2: 2 },
      { x1: 2, y1: 2, x2: 3, y2: 2 },
      { x1: 4, y1: 2, x2: 5, y2: 2 },
      { x1: 5, y1: 0, x2: 5, y2: 2 },
    ],
    terminals: [
      { x: 1, y: 0, key: 'a:in', instruction: 'a', input: true },
      { x: 2, y: 0, key: 'a:out', instruction: 'a', input: false },
      { x: 3, y: 2, key: 'b:in', instruction: 'b', input: true },
      { x: 4, y: 2, key: 'b:out', instruction: 'b', input: false },
      { x: 5, y: 0, key: 'c:in', instruction: 'c', input: true },
    ],
  };
  const target: ConnectionInput = {
    railX: 0,
    wires: source.wires.map((w) => ({
      x1: w.x1 * 3,
      y1: w.y1 * 4 + 5,
      x2: w.x2 * 3,
      y2: w.y2 * 4 + 5,
    })),
    terminals: source.terminals.map((t) => ({ ...t, x: t.x * 3, y: t.y * 4 + 5 })),
  };
  for (const side of compareConnectionGraphs([source], [target]))
    for (const difference of side) {
      assert.deepEqual(difference.wires, []);
      assert.deepEqual(difference.inputs, []);
      assert.deepEqual(difference.outputs, []);
    }
});
