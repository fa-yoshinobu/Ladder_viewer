import { requireValue } from '../src/requireValue';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseKeyenceMnm } from '../src/keyence/parser.ts';
import { buildKeyenceNetworks } from '../src/keyence/logic.ts';
import {
  layoutKeyenceNetwork,
  keyenceViewDrawing,
  keyenceDrawingPages,
  type KeyenceDrawing,
} from '../src/keyence/layout.ts';
import { compareKeyencePrograms, keyenceComparisonDrawings } from '../src/keyence/comparison.ts';
import { keyenceCompareDrawing } from '../src/keyence/compareDrawing.tsx';
import { compareConnectionGraphs } from '../src/connectionGraph.ts';
import { CELL, ROW, BASELINE, PAGE_GAP } from '../src/ladderMetrics.ts';

const program = (commands: string[]) =>
  parseKeyenceMnm(
    new TextEncoder().encode(['DEVICE:99', ...commands].join('\n')).buffer,
    'synthetic-alignment.mnm',
  );
const parallel = ['LD R0', ...Array.from({ length: 6 }, (_, index) => `OR R${index + 1}`)];
const prefix = [...parallel, 'MPS', 'ANB MR10', 'MOV #1 DM0', 'MPP'];
const row = (d: KeyenceDrawing, y: number) =>
  Math.round((y - d.headerHeight - d.baseline) / d.rowHeight);
const graph = (d: KeyenceDrawing) => ({
  railX: d.left,
  wires: d.wires,
  terminals: d.symbols.flatMap((s) => [
    { x: s.x, y: s.y, key: s.instruction.id + ':in', instruction: s.instruction.id, input: true },
    ...(['contact', 'comparison', 'inline'].includes(s.kind) ||
    d.network.actions.some(
      (a) =>
        a.continuations?.length &&
        [a.instruction, ...a.continuations].slice(0, -1).includes(s.instruction),
    )
      ? [
          {
            x: s.x + s.width,
            y: s.y,
            key: s.instruction.id + ':out',
            instruction: s.instruction.id,
            input: false,
          },
        ]
      : []),
  ]),
});

test('KEYENCE inserted outputs align without stretching shared contacts or changing connections', () => {
  for (const count of [1, 3, 9])
    for (const reverse of [false, true]) {
      const base = [...prefix, 'OUT MR10'],
        extended = [
          ...prefix,
          ...Array.from({ length: count }, (_, index) => `OUT MR${100 + index}`),
          'OUT MR10',
        ];
      const comparison = compareKeyencePrograms(
        program(reverse ? base : extended),
        program(reverse ? extended : base),
      );
      const aligned = requireValue(keyenceComparisonDrawings(comparison, false, 'scroll')[0]),
        natural = requireValue(keyenceComparisonDrawings(comparison, false, 'scroll', false)[0]);
      for (const side of ['source', 'target'] as const) {
        const d = requireValue(aligned[side][0]),
          original = requireValue(natural[side][0]);
        assert.deepEqual(
          d.symbols
            .filter((s) => /^R[0-6]$/.test(s.instruction.operands[0] ?? ''))
            .map((s) => row(d, s.y)),
          [0, 1, 2, 3, 4, 5, 6],
        );
        assert.equal(
          row(
            d,
            d.symbols.find(
              (s) => s.instruction.opcode === 'OUT' && s.instruction.operands[0] === 'MR10',
            )!.y,
          ),
          count + 1,
        );
        assert.equal(d.rows, Math.max(7, count + 2));
        for (const changes of compareConnectionGraphs([graph(original)], [graph(d)]))
          assert.deepEqual(
            changes.map(({ wires, inputs, outputs }) => ({ wires, inputs, outputs })),
            [{ wires: [], inputs: [], outputs: [] }],
          );
        const colors = (drawing: KeyenceDrawing) =>
          drawing.symbols.map((s) => [s.instruction.id, s.inputDifference, s.outputDifference]);
        assert.deepEqual(colors(d), colors(original));
      }
      const blocks = requireValue(keyenceCompareDrawing(comparison, false, 1, 'scroll', 'both')[0]);
      for (const side of ['source', 'target'] as const) {
        const coil = requireValue(aligned[side][0]).symbols.find(
          (s) => s.instruction.opcode === 'OUT' && s.instruction.operands[0] === 'MR10',
        )!;
        assert.equal(
          requireValue(blocks[side][0]).locations!.find((l) => l.id === coil.instruction.id)!.y,
          (count + 1) * ROW,
        );
      }
    }
});

test('KEYENCE independently aligned output groups retain CON links and the full height of function blocks', () => {
  for (const chain of [false, true]) {
    const ending = chain
      ? ['MOV #10 DM10', 'CON', 'MOV #20 DM20', 'OUT MR10']
      : ['FB Dummy DM1 DM2 DM3', 'OUT MR10'];
    const comparison = compareKeyencePrograms(
      program([...prefix, 'OUT MR100', ...ending]),
      program([...prefix, ...ending]),
    );
    const aligned = requireValue(keyenceComparisonDrawings(comparison, false, 'scroll')[0]),
      natural = requireValue(keyenceComparisonDrawings(comparison, false, 'scroll', false)[0]);
    for (const side of ['source', 'target'] as const) {
      const d = requireValue(aligned[side][0]),
        first = d.symbols.find(
          (s) =>
            s.instruction.opcode === (chain ? 'MOV' : 'FB') &&
            s.instruction.operands[0] === (chain ? '#10' : 'Dummy'),
        )!;
      const coil = d.symbols.find(
        (s) => s.instruction.opcode === 'OUT' && s.instruction.operands[0] === 'MR10',
      )!;
      assert.equal(row(d, first.y), 2);
      assert.equal(row(d, coil.y), 2 + (first.blockRows ?? 1));
      if (chain)
        assert.equal(first.y, d.symbols.find((s) => s.instruction.operands[0] === '#20')!.y);
      else assert.equal(first.blockRows, 4);
      for (const changes of compareConnectionGraphs(
        [graph(requireValue(natural[side][0]))],
        [graph(d)],
      ))
        assert.deepEqual(
          changes.map(({ wires, inputs, outputs }) => ({ wires, inputs, outputs })),
          [{ wires: [], inputs: [], outputs: [] }],
        );
    }
  }
});

test('KEYENCE sparse wrapped pages use their own heights and cumulative navigation offsets', () => {
  for (const contacts of [11, 25]) {
    const commands = [
      ...parallel,
      'MPS',
      ...Array.from({ length: contacts }, (_, index) => `AND R${20 + index}`),
      'MOV #1 DM0',
      'MPP',
      'OUT MR10',
    ];
    const p = program(commands),
      n = requireValue(buildKeyenceNetworks(p)[0]),
      base = layoutKeyenceNetwork(n, p, false),
      snapshot = JSON.stringify(base);
    const d = keyenceViewDrawing(base, 'wrap'),
      pages = contacts === 11 ? 2 : 3;
    assert.equal(d.continuationLabels!.length, pages);
    assert.equal(d.height, (7 + 2 * (pages - 1)) * ROW + pages * PAGE_GAP);
    const top = (7 + 2 * (pages - 2)) * ROW + (pages - 1) * PAGE_GAP;
    assert.equal(d.symbols.find((s) => s.instruction.opcode === 'MOV')!.y, top + BASELINE);
    assert.equal(d.symbols.find((s) => s.instruction.opcode === 'OUT')!.y, top + ROW + BASELINE);
    assert.equal(d.rails!.at(-1)!.bottom, d.height - PAGE_GAP);
    assert.equal(d.continuationLabels!.at(-1)!.y, d.height - PAGE_GAP + 15);
    assert.equal(JSON.stringify(base), snapshot);
    assert.equal(keyenceViewDrawing(base, 'scroll'), base);
  }
});

test('KEYENCE comparison shares wrapped page heights only where matching subsequent pages need alignment', () => {
  const suffix = [...Array.from({ length: 12 }, (_, index) => `AND R${20 + index}`), 'MOV #1 DM0'];
  const comparison = compareKeyencePrograms(
    program([...parallel, ...suffix]),
    program([...parallel.slice(0, 3), ...suffix]),
  );
  const aligned = requireValue(keyenceComparisonDrawings(comparison, false, 'wrap')[0]),
    natural = requireValue(keyenceComparisonDrawings(comparison, false, 'wrap', false)[0]);
  assert.equal(
    requireValue(aligned.source[0]).symbols.find((s) => s.instruction.opcode === 'MOV')!.y,
    requireValue(aligned.target[0]).symbols.find((s) => s.instruction.opcode === 'MOV')!.y,
  );
  assert.equal(requireValue(aligned.source[0]).height, 8 * ROW + 2 * PAGE_GAP);
  assert.equal(requireValue(aligned.target[0]).height, 8 * ROW + 2 * PAGE_GAP);
  assert.equal(requireValue(natural.target[0]).height, 4 * ROW + 2 * PAGE_GAP);
});

test('KEYENCE page compaction retains wire-only branches, function blocks and difference colors', () => {
  const commands = [
    ...parallel,
    ...Array.from({ length: 11 }, (_, index) => `AND R${20 + index}`),
    'FB Dummy DM1 DM2 DM3',
  ];
  const p = program(commands),
    base = layoutKeyenceNetwork(requireValue(buildKeyenceNetworks(p)[0]), p, false, true);
  assert.deepEqual(
    keyenceDrawingPages(base).map((page) => page.rows),
    [7, 4],
  );
  const wrapped = keyenceViewDrawing(base, 'wrap'),
    fb = wrapped.symbols.find((s) => s.kind === 'fb')!;
  assert.equal(wrapped.height, 11 * ROW + 2 * PAGE_GAP);
  assert.ok(fb.y - BASELINE + fb.blockRows! * ROW <= wrapped.height - PAGE_GAP);
  const x = base.left + 13 * CELL,
    wire = { x1: x, y1: BASELINE, x2: x, y2: BASELINE + 6 * ROW, difference: 'removed' as const };
  const extended = { ...base, wires: [...base.wires, wire] };
  assert.deepEqual(
    keyenceDrawingPages(extended).map((page) => page.rows),
    [7, 7],
  );
  const branch = keyenceViewDrawing(extended, 'wrap').wires.find(
    (w) => w.difference === 'removed',
  )!;
  assert.equal(branch.y2 - branch.y1, 6 * ROW);
});

test('KEYENCE folded output insertion preserves contacts and search locations on later pages', () => {
  const before = [
    ...parallel,
    'MPS',
    ...Array.from({ length: 11 }, (_, index) => `AND R${20 + index}`),
    'MOV #1 DM0',
    'MPP',
  ];
  const comparison = compareKeyencePrograms(
    program([...before, 'OUT MR100', 'OUT MR101', 'OUT MR102', 'OUT MR10']),
    program([...before, 'OUT MR10']),
  );
  const aligned = requireValue(keyenceComparisonDrawings(comparison, false, 'wrap')[0]),
    blocks = requireValue(keyenceCompareDrawing(comparison, false, 1, 'wrap', 'both')[0]);
  for (const side of ['source', 'target'] as const) {
    const d = requireValue(aligned[side][0]),
      coil = d.symbols.find(
        (s) => s.instruction.opcode === 'OUT' && s.instruction.operands[0] === 'MR10',
      )!;
    assert.deepEqual(
      d.symbols.filter((s) => /^R[0-6]$/.test(s.instruction.operands[0] ?? '')).map((s) => s.y),
      Array.from({ length: 7 }, (_, index) => BASELINE + index * ROW),
    );
    assert.equal(d.height, 12 * ROW + 2 * PAGE_GAP);
    assert.equal(coil.y, 11 * ROW + PAGE_GAP + BASELINE);
    assert.equal(
      requireValue(blocks[side][0]).locations!.find((l) => l.id === coil.instruction.id)!.y,
      coil.y - BASELINE,
    );
  }
});

test('KEYENCE compact comparison pages preserve different statement heights and comment row spacing', () => {
  const commands = [
    ...parallel,
    ...Array.from({ length: 12 }, (_, index) => `AND R${20 + index}`),
    'MOV #1 DM0',
  ];
  const comparison = compareKeyencePrograms(
    program([
      ';' + 'Dummy heading '.repeat(20),
      ...commands.map((c) => (c === 'LD R0' ? c + ' ; Dummy contact' : c)),
    ]),
    program(commands),
  );
  const aligned = requireValue(keyenceComparisonDrawings(comparison, true, 'wrap')[0]);
  for (const [index, s] of requireValue(aligned.source[0]).symbols.entries())
    assert.equal(
      s.y,
      requireValue(requireValue(aligned.target[0]).symbols[index]).y,
      'matching symbols keep the same height after wrapping different statements',
    );
  for (const d of [aligned.source[0], aligned.target[0]]) {
    assert.equal(requireValue(d).rowHeight, 72);
    assert.equal(requireValue(d).height - requireValue(d).headerHeight, 8 * 72 + 2 * PAGE_GAP);
  }
});

test('KEYENCE KEEP aligns its input branches independently and retains both port connections', () => {
  const source = [
    'LD<.D #10 DM0',
    'AND<.D DM0 #20',
    'LD<.D #30 DM0',
    'AND<.D DM0 #40',
    'ORL',
    'LD<.D #50 DM0',
    'AND<.D DM0 #60',
    'ORL',
    'LD R10',
    'ORB R11',
    'LD R12',
    'AND R13',
    'ORL',
    'ANL',
    'LD R90',
    'KEEP MR9',
  ];
  const target = source.filter((c) => c !== 'ORB R11');
  for (const reverse of [false, true]) {
    const comparison = compareKeyencePrograms(
      program(reverse ? target : source),
      program(reverse ? source : target),
    );
    const aligned = requireValue(keyenceComparisonDrawings(comparison, false, 'scroll')[0]),
      natural = requireValue(keyenceComparisonDrawings(comparison, false, 'scroll', false)[0]);
    const connections = (d: KeyenceDrawing) => {
      const g = graph(d);
      g.terminals = g.terminals.filter(
        (t) => !d.symbols.some((s) => s.ports && s.instruction.id === t.instruction),
      );
      for (const s of d.symbols)
        for (const port of s.ports ?? [])
          g.terminals.push({
            x: s.x,
            y: port.y,
            key: s.instruction.id + ':' + port.name,
            instruction: s.instruction.id + ':' + port.name,
            input: true,
          });
      return g;
    };
    for (const side of ['source', 'target'] as const) {
      const d = requireValue(aligned[side][0]);
      assert.deepEqual(
        d.symbols.filter((s) => s.kind === 'comparison').map((s) => row(d, s.y)),
        [0, 0, 1, 1, 2, 2],
      );
      assert.equal(row(d, d.symbols.find((s) => s.instruction.operands[0] === 'R12')!.y), 2);
      assert.deepEqual(
        d.symbols.find((s) => s.ports)!.ports!.map((p) => [p.name, row(d, p.y)]),
        [
          ['SET', 0],
          ['RES', 3],
        ],
      );
      for (const changes of compareConnectionGraphs(
        [connections(requireValue(natural[side][0]))],
        [connections(d)],
      ))
        assert.deepEqual(
          changes.map(({ wires, inputs, outputs }) => ({ wires, inputs, outputs })),
          [{ wires: [], inputs: [], outputs: [] }],
        );
    }
  }
});
