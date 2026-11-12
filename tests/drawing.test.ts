import test from 'node:test';
import assert from 'node:assert/strict';
import { strokeCoordinates } from '../src/drawing.ts';
import {
  mergeWires,
  gridLayout,
  displayGrid,
  type GridWire,
  type GridLayout,
} from '../src/layout.ts';
import { buildProgram, parseProgram, type Network } from '../src/model.ts';
import { alignCircuitRows, parseComparison } from '../src/comparison.ts';
import { comparisonDisplayProgram } from '../src/comparisonDisplay.ts';
import { instructionDrawingOffset } from '../src/NetworkDrawing.tsx';
import { compareConnectionGraphs } from '../src/connectionGraph.ts';

test('wire and rail stroke edges align at fractional zoom and DPI', () => {
  for (const cssWidth of [1, 2])
    for (const zoom of [0.8, 1, 1.4, 1.41, 1.5])
      for (const ratio of [1, 1.25, 1.5, 2])
        for (const origin of [0, 0.2, 151.2, 386.2]) {
          const c = strokeCoordinates(zoom, ratio, origin, origin, cssWidth);
          for (const value of [0, 7, 28, 37, 74, 148, 392])
            for (const position of [c.x(value), c.y(value)]) {
              const center = (origin + position * zoom) * ratio;
              const half = (c.width * zoom * ratio) / 2;
              for (const edge of [center - half, center + half])
                assert.ok(
                  Math.abs(edge - Math.round(edge)) < 1e-7,
                  `${zoom}, ${ratio}, ${origin}, ${value}`,
                );
            }
          assert.equal(Math.round(c.width * c.scale), Math.max(1, Math.round(cssWidth * ratio)));
        }
});
test('overlapping and reversed spans merge without joining parallel wires', () => {
  assert.deepEqual(
    mergeWires([
      { x1: 0, y1: 0, x2: 4, y2: 0 },
      { x1: 6, y1: 0, x2: 2, y2: 0 },
      { x1: 6, y1: 0, x2: 8, y2: 0 },
      { x1: 0, y1: 1, x2: 4, y2: 1 },
      { x1: 2, y1: 0, x2: 2, y2: 3 },
      { x1: 2, y1: 1, x2: 2, y2: 4 },
    ]),
    [
      { x1: 0, y1: 0, x2: 8, y2: 0 },
      { x1: 0, y1: 1, x2: 4, y2: 1 },
      { x1: 2, y1: 0, x2: 2, y2: 4 },
    ],
  );
});
function overlap(a: GridWire, b: GridWire) {
  const h = a.y1 === a.y2 && b.y1 === b.y2 && a.y1 === b.y1;
  const v = a.x1 === a.x2 && b.x1 === b.x2 && a.x1 === b.x1;
  return h
    ? Math.min(a.x2, b.x2) > Math.max(a.x1, b.x1)
    : v && Math.min(a.y2, b.y2) > Math.max(a.y1, b.y1);
}
test('synthetic nested branches keep every visible instruction without repeated wire spans', () => {
  const ops = [
    ['LD', 'X30'],
    ['LD', 'X31'],
    ['AND', 'X32'],
    ['LD', 'X33'],
    ['AND', 'X34'],
    ['ORB', ''],
    ['ANB', ''],
    ['LD', 'X35'],
    ['ORB', ''],
    ['AND', 'X36'],
    ['MPS', ''],
    ['OUT', 'Y30'],
    ['MPP', ''],
    ['AND', 'X37'],
    ['OUT', 'Y31'],
    ['LD', 'X40'],
    ['AND', 'X41'],
    ['LD', 'X42'],
    ['OR', 'X43'],
    ['ANB', ''],
    ['MPS', ''],
    ['SET', 'M40'],
    ['MPP', ''],
    ['ANI', 'X44'],
    ['OUT', 'Y40'],
  ];
  const text = [
    'ステップ番号\t命令\tI/O(デバイス)',
    ...ops.map(([op, arg], i) => [String(i), op, arg].join('\t')),
  ].join('\n');
  const p = parseProgram(text, 'synthetic-branches.csv');
  assert.equal(p.networks.length, 2);
  assert.deepEqual(
    p.networks.flatMap((n) => n.warnings),
    [],
  );
  for (const n of p.networks) {
    const g = gridLayout(n);
    assert.ok(
      g.wires.some((w) => w.x1 === w.x2 && w.y1 !== w.y2),
      'fixture contains a branch wire',
    );
    for (let i = 0; i < g.wires.length; i++)
      for (let j = i + 1; j < g.wires.length; j++)
        assert.ok(!overlap(g.wires[i], g.wires[j]), n.step);
    for (const instruction of n.instructions.filter(
      (i) => !['MPS', 'MPP', 'ANB', 'ORB'].includes(i.op),
    )) {
      assert.equal(
        g.symbols.filter((s) => s.instruction.id === instruction.id).length,
        1,
        instruction.op + ' is drawn once',
      );
    }
  }
});

function placedNetwork(commands: string[]) {
  return buildProgram(
    commands.map((command, index) => {
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
    'synthetic-placement',
  ).networks[0];
}
function syntheticComparison(source: string[], target: string[]) {
  const rows = [
    ['行', 'ステップ', '照合元', 'ステップ', '照合先', '照合結果'],
    ...Array.from({ length: Math.max(source.length, target.length) }, (_, index) => [
      String(index + 1),
      source[index] ? String(index) : '',
      source[index] ?? '',
      target[index] ? String(index) : '',
      target[index] ?? '',
      '不一致',
    ]),
  ];
  return parseComparison(
    rows.map((row) => row.map((value) => '"' + value + '"').join('\t')).join('\n'),
    'synthetic-branch-placement',
  );
}
function assertNetConnections(n: Network, g: GridLayout, nets: string[][]) {
  const expected = {
    railX: 0,
    wires: nets.map((net, row) => ({ x1: row ? 1 : 0, y1: row, x2: net.length, y2: row })),
    terminals: nets.flatMap((net, row) =>
      net.map((key, col) => ({
        x: row ? col + 1 : col,
        y: row,
        key,
        instruction: key.split(':')[0],
        input: key.endsWith(':in'),
      })),
    ),
  };
  const actual = {
    railX: 0,
    wires: g.wires,
    terminals: g.symbols.flatMap((s) => {
      const id = String(n.instructions.indexOf(s.instruction));
      return [
        { x: s.col, y: s.row, key: id + ':in', instruction: id, input: true },
        ...(s.contact
          ? [{ x: s.col + s.span, y: s.row, key: id + ':out', instruction: id, input: false }]
          : []),
      ];
    }),
  };
  for (const side of compareConnectionGraphs([expected], [actual]))
    assert.deepEqual(
      side.map(({ wires, inputs, outputs }) => ({ wires, inputs, outputs })),
      [{ wires: [], inputs: [], outputs: [] }],
    );
}
const sharedParallel = ['LD X10', 'LD X11', 'OR X12', 'OR X13', 'ANB', 'OUT Y20', 'OUT T41 K20'];

test('comparison keeps a new series branch and its output on the same row', () => {
  const longer = [
    'LD X0',
    'MPS',
    'LDI X1',
    'ORI X2',
    'ORI X3',
    'ORI X4',
    'ANB',
    'MOV K1 D0',
    'MPP',
    'AND X6',
    'AND X7',
    'MOV K2 D0',
  ];
  const shorter = longer
    .filter((command) => command !== 'ORI X4')
    .map((command) => (command === 'AND X7' ? 'AND X8' : command));
  for (const reverse of [false, true]) {
    const networks = (reverse ? [shorter, longer] : [longer, shorter]).map((commands) => {
      const n = placedNetwork(commands);
      // The final contacts are unmatched; only their outputs have a common comparison row.
      n.instructions.forEach((i, index) => {
        i.comparisonRow =
          commands[index] === 'AND X8'
            ? longer.indexOf('AND X7') * 2 + 2
            : longer.indexOf(commands[index]) * 2 + 1;
      });
      return n;
    });
    alignCircuitRows([networks[0]], [networks[1]]);
    const grids = networks.map(gridLayout);
    for (const g of grids) {
      const contacts = g.symbols.filter(
        (s) =>
          s.contact &&
          s.instruction.op === 'AND' &&
          ['X6', 'X7', 'X8'].includes(s.instruction.operands[0]),
      );
      const output = g.symbols.find(
        (s) => s.instruction.op === 'MOV' && s.instruction.operands[0] === 'K2',
      )!;
      assert.deepEqual(
        contacts.map((s) => s.row),
        [output.row, output.row],
        'move the complete series branch with its output',
      );
      assert.equal(output.row, 4, 'matching output branches retain vertical comparison alignment');
      assert.deepEqual(
        g.symbols
          .filter((s) => s.contact && ['X1', 'X2', 'X3'].includes(s.instruction.operands[0]))
          .map((s) => s.row),
        [0, 1, 2],
        'the existing parallel inputs must not stretch',
      );
    }
    const natural = gridLayout({
      ...networks[reverse ? 0 : 1],
      rowAlignment: undefined,
      branchRowAlignment: undefined,
      outputRowAlignment: undefined,
    });
    assert.equal(
      natural.symbols.find((s) => s.instruction.op === 'MOV' && s.instruction.operands[0] === 'K2')!
        .row,
      3,
    );
  }
});

test('a branch starts below right-side obstacles without waiting for the taller shared left condition', () => {
  for (const count of [4, 7])
    for (const reverse of [false, true]) {
      const prefix = [
        'LD X0',
        ...Array.from({ length: count - 1 }, (_, index) => `OR X${index + 1}`),
      ];
      const suffix = [
        'MPS',
        'LDI X10',
        'ORI X11',
        'ORI X12',
        'ANB',
        'MOV K1 D0',
        'MPP',
        'AND X20',
        'MOV K2 D0',
      ];
      const longer = [...prefix, ...suffix],
        shorter = [...prefix.slice(0, 3), ...suffix];
      const p = syntheticComparison(reverse ? shorter : longer, reverse ? longer : shorter);
      for (const side of ['source', 'target'] as const) {
        const program = side === 'source' ? p : p.comparison!.target;
        for (const n of [program.networks[0], comparisonDisplayProgram(p, side).networks[0]]) {
          const g = gridLayout(n),
            commands = n.instructions.map((i) => [i.op, ...i.operands].join(' '));
          const shared = commands.filter((command) => prefix.includes(command));
          assert.deepEqual(
            g.symbols
              .filter(
                (s) =>
                  s.instruction.operands[0] === 'X20' ||
                  (s.instruction.op === 'MOV' && s.instruction.operands[0] === 'K2'),
              )
              .map((s) => s.row),
            [3, 3],
          );
          assert.equal(g.rows, Math.max(4, shared.length));
          for (const devices of [
            ['X0', 'X1', 'X2'],
            ['X10', 'X11', 'X12'],
          ])
            assert.deepEqual(
              g.symbols
                .filter((s) => s.contact && devices.includes(s.instruction.operands[0]))
                .map((s) => s.row),
              [0, 1, 2],
            );
          const terminal = (command: string, side: 'in' | 'out') =>
            `${commands.indexOf(command)}:${side}`;
          const right = ['LDI X10', 'ORI X11', 'ORI X12'];
          assertNetConnections(n, g, [
            shared.map((command) => terminal(command, 'in')),
            [
              ...shared.map((command) => terminal(command, 'out')),
              ...right.map((command) => terminal(command, 'in')),
              terminal('AND X20', 'in'),
            ],
            [...right.map((command) => terminal(command, 'out')), terminal('MOV K1 D0', 'in')],
            [terminal('AND X20', 'out'), terminal('MOV K2 D0', 'in')],
          ]);
        }
      }
    }
});

test('a new suffix uses the free right side of a shared parallel condition without changing connections', () => {
  const commands = [
    'LD X0',
    'AND X1',
    'OR M0',
    'LD X2',
    'OR X3',
    'OR X4',
    'OR X5',
    'ANB',
    'MPS',
    'ANI M0',
    'MOV K1 D0',
    'MPP',
    'OUT M0',
    'ANI X6',
    'MPS',
    'AND X7',
    'MOV K2 D0',
    'MPP',
    'LD X8',
    'OR X9',
    'OR X10',
    'ANB',
    'MOV K3 D0',
  ];
  const p = syntheticComparison(commands, commands.slice(0, 13));
  for (const n of [
    placedNetwork(commands),
    p.networks[0],
    comparisonDisplayProgram(p, 'source').networks[0],
  ]) {
    const g = gridLayout(n);
    assert.deepEqual(n.warnings, []);
    assert.deepEqual(
      g.symbols.filter((s) => !s.contact).map((s) => s.row),
      [0, 1, 2, 3],
    );
    assert.equal(g.rows, 6);
    assert.deepEqual(
      g.symbols
        .filter((s) => s.contact && ['X2', 'X3', 'X4', 'X5'].includes(s.instruction.operands[0]))
        .map((s) => s.row),
      [0, 1, 2, 3],
    );
    // Specify electrical nets independently of the drawing's coordinates (instruction index:terminal).
    const nets = [
      ['0:in', '2:in'],
      ['0:out', '1:in'],
      ['1:out', '2:out', '3:in', '4:in', '5:in', '6:in'],
      ['3:out', '4:out', '5:out', '6:out', '9:in', '12:in', '13:in'],
      ['9:out', '10:in'],
      ['13:out', '15:in', '18:in', '19:in', '20:in'],
      ['15:out', '16:in'],
      ['18:out', '19:out', '20:out', '22:in'],
    ];
    assertNetConnections(n, g, nets);
  }
});

test('outputs sharing a three-row condition use its first and second rows', () => {
  const n = placedNetwork(sharedParallel),
    g = gridLayout(n);
  assert.deepEqual(n.warnings, []);
  assert.equal(g.rows, 3);
  assert.deepEqual(
    g.symbols.filter((s) => !s.contact).map((s) => s.row),
    [0, 1],
  );
  assert.deepEqual(
    g.symbols
      .filter((s) => s.contact && ['X11', 'X12', 'X13'].includes(s.instruction.operands[0]))
      .map((s) => s.row),
    [0, 1, 2],
  );
  assert.deepEqual(
    g.symbols.find((s) => s.instruction.operands[0] === 'T41')!.instruction.operands,
    ['T41', 'K20'],
  );
  assert.ok(
    g.wires.some((w) => w.x1 === 2 && w.x2 === 2 && w.y1 === 0 && w.y2 === 2),
    'all three parallel inputs retain their shared junction',
  );
  for (const instruction of n.instructions.filter((i) => i.op !== 'ANB'))
    assert.equal(g.symbols.filter((s) => s.instruction === instruction).length, 1);
});

test('an FB reserves its full output height while sharing parallel-condition height', () => {
  const n = placedNetwork(sharedParallel),
    fb = n.actions[0].instruction;
  fb.op = 'FBCALL Synthetic';
  fb.operands = [];
  fb.pins = Array.from({ length: 4 }, (_, index) => ({
    id: `pin-${index}`,
    sourceRow: 100 + index,
    step: '',
    op: 'Synthetic IN:Value',
    operands: [`D${index}`],
    note: '',
    statement: '',
  }));
  const g = gridLayout(n),
    outputs = g.symbols.filter((s) => !s.contact);
  assert.deepEqual(
    outputs.map((s) => s.row),
    [0, 3],
    'the second output starts after the three-row FB',
  );
  assert.equal(g.rows, 4);
  assert.equal(outputs[0].span, 5);
  assert.equal(outputs[0].instruction.pins, fb.pins);
  assert.deepEqual(
    g.symbols.filter((s) => s.contact && s.col === 1).map((s) => s.row),
    [0, 1, 2],
  );
});

test('restoring a shared condition packs the coil beside its branches in normal and comparison views', () => {
  for (const branchRows of [2, 7]) {
    const commands = [
      'LD X0',
      ...Array.from({ length: branchRows - 1 }, (_, index) => `OR X${index + 1}`),
      'MPS',
      'ANI M10',
      'MOV K1 D0',
      'MPP',
      'OUT M10',
    ];
    const csv = [
      ['行', 'ステップ', '照合元', 'ステップ', '照合先', '照合結果'],
      ...commands.map((command, index) => [
        String(index + 1),
        String(index),
        command,
        String(index),
        command.replace('K1', 'K2'),
        '不一致',
      ]),
    ]
      .map((row) => row.map((value) => '"' + value + '"').join('\t'))
      .join('\n');
    const comparison = parseComparison(csv, 'restored-condition');
    for (const n of [
      placedNetwork(commands),
      comparison.networks[0],
      comparison.comparison!.target.networks[0],
    ]) {
      const g = gridLayout(n);
      assert.deepEqual(n.warnings, []);
      assert.equal(g.rows, branchRows);
      assert.deepEqual(
        g.symbols.filter((s) => !s.contact).map((s) => s.row),
        [0, 1],
      );
      assert.deepEqual(
        g.symbols
          .filter((s) => s.contact && s.instruction.operands[0].startsWith('X'))
          .map((s) => s.row),
        Array.from({ length: branchRows }, (_, index) => index),
      );
      assert.ok(
        g.wires.every((w) => !w.difference),
        'changing a MOV value does not change the shared output connections',
      );
      if (n.rowAlignment)
        assert.deepEqual(
          n.rowAlignment,
          Array.from({ length: branchRows }, (_, index) => index),
        );
    }
  }
});

test('restoring a condition keeps the output below branches on its right', () => {
  const n = placedNetwork([
    'LD X0',
    'MPS',
    'LD X1',
    'OR X2',
    'OR X3',
    'ANB',
    'OUT Y0',
    'MPP',
    'OUT Y1',
  ]);
  const g = gridLayout(n);
  assert.deepEqual(n.warnings, []);
  assert.deepEqual(
    g.symbols.filter((s) => !s.contact).map((s) => s.row),
    [0, 3],
  );
  assert.equal(g.rows, 4);
  for (const symbol of g.symbols.filter((s) => s.contact))
    assert.ok(
      !g.wires.some(
        (w) =>
          w.y1 === symbol.row &&
          w.y2 === symbol.row &&
          Math.min(w.x1, w.x2) < symbol.col + symbol.span &&
          Math.max(w.x1, w.x2) > symbol.col,
      ),
      'output wires do not bypass a contact',
    );
});

test('different MPS/MRD conditions clear earlier parallel branches without duplicating shared contacts', () => {
  const n = placedNetwork([
    'LD X0',
    'MPS',
    'LD X1',
    'OR X2',
    'OR X3',
    'ANB',
    'OUT Y0',
    'OUT Y1',
    'MRD',
    'LD X4',
    'OR X5',
    'OR X6',
    'ANB',
    'OUT Y2',
    'MPP',
    'AND X7',
    'OUT Y3',
  ]);
  const g = gridLayout(n);
  assert.deepEqual(n.warnings, []);
  assert.deepEqual(
    g.symbols.filter((s) => !s.contact).map((s) => s.row),
    [0, 1, 3, 6],
  );
  assert.equal(g.rows, 7);
  assert.equal(g.symbols.filter((s) => s.instruction.operands[0] === 'X0').length, 1);
  assert.deepEqual(
    g.symbols
      .filter((s) => s.contact && ['X4', 'X5', 'X6'].includes(s.instruction.operands[0]))
      .map((s) => s.row),
    [3, 4, 5],
  );
  for (let i = 0; i < g.wires.length; i++)
    for (let j = i + 1; j < g.wires.length; j++) assert.ok(!overlap(g.wires[i], g.wires[j]));
});

test('packed outputs retain comparison alignment and do not invent an operand-only wire difference', () => {
  const source = sharedParallel,
    target = [...sharedParallel.slice(0, -1), 'OUT T41 K21'];
  const csv = [
    ['行', 'ステップ', '照合元', 'ステップ', '照合先', '照合結果'],
    ...source.map((command, index) => [
      String(index + 1),
      String(index),
      command,
      String(index),
      target[index],
      '不一致',
    ]),
  ]
    .map((row) => row.map((value) => '"' + value.replaceAll('"', '""') + '"').join('\t'))
    .join('\n');
  const p = parseComparison(csv, 'synthetic-placement-comparison');
  for (const side of [p, p.comparison!.target]) {
    const n = side.networks[0],
      g = gridLayout(n);
    assert.equal(g.rows, 3);
    assert.deepEqual(n.rowAlignment, [0, 1, 2]);
    assert.deepEqual(
      g.symbols.filter((s) => !s.contact).map((s) => s.row),
      [0, 1],
    );
    assert.ok(g.wires.every((w) => !w.difference));
    assert.deepEqual(n.connectionDifferences!.wires, []);
    const original = JSON.stringify(g);
    n.rowAlignment = [0, 2, 3];
    n.connectionDifferences = {
      kind: 'removed',
      wires: [0],
      inputs: [n.actions[1].instruction.id],
      outputs: [],
    };
    const padded = gridLayout(n);
    assert.equal(padded.rows, 4);
    assert.deepEqual(
      padded.symbols.filter((s) => !s.contact).map((s) => s.row),
      [0, 2],
    );
    assert.equal(padded.wires[0].difference, 'removed');
    for (let index = 0; index < g.wires.length; index++) {
      assert.equal(padded.wires[index].x1, g.wires[index].x1);
      assert.equal(padded.wires[index].x2, g.wires[index].x2);
      assert.equal(padded.wires[index].y1, n.rowAlignment[g.wires[index].y1]);
      assert.equal(padded.wires[index].y2, n.rowAlignment[g.wires[index].y2]);
    }
    assert.equal(JSON.stringify(g), original, 'the earlier grid result is not mutated');
  }
});

test('an inserted shared output keeps the existing timer aligned and branch input connections unchanged', () => {
  const source = sharedParallel,
    target = [...source.slice(0, -1), 'OUT M999', source.at(-1)!];
  const csv = [
    ['行', 'ステップ', '照合元', 'ステップ', '照合先', '照合結果'],
    ...target.map((command, index) => [
      String(index + 1),
      source[index] ? String(index) : '',
      source[index] ?? '',
      String(index),
      command,
      '不一致',
    ]),
  ]
    .map((row) => row.map((value) => '"' + value.replaceAll('"', '""') + '"').join('\t'))
    .join('\n');
  const p = parseComparison(csv, 'synthetic-shared-output-insertion');
  assert.deepEqual(
    p.comparison!.changes.map((change) => change.kind),
    ['added'],
  );
  const grids = [p, p.comparison!.target].map((side) => {
    const n = side.networks[0],
      g = gridLayout(n);
    assert.deepEqual(n.warnings, []);
    assert.ok(
      g.symbols.filter((s) => s.contact).every((s) => !s.inputDifference),
      'inserting a shared output does not alter the branch input net',
    );
    assert.ok(
      n.connectionDifferences!.wires.every((index) => index >= 0 && index < g.wires.length),
    );
    assert.ok(n.rowAlignment!.every((row, index, all) => index === 0 || row > all[index - 1]));
    return g;
  });
  const timerRow = (g: ReturnType<typeof gridLayout>) =>
    g.symbols.find((s) => !s.contact && s.instruction.operands[0] === 'T41')!.row;
  assert.equal(timerRow(grids[0]), timerRow(grids[1]));
});

test('one-sided coils align independently without stretching unchanged parallel contacts', () => {
  const prefix = [
    'LD X0',
    ...Array.from({ length: 6 }, (_, index) => `OR X${index + 1}`),
    'MPS',
    'ANI M10',
    'MOV K1 D0',
    'MPP',
  ];
  const terminals = (grid: ReturnType<typeof gridLayout>) => ({
    railX: 0,
    wires: grid.wires,
    terminals: grid.symbols.flatMap((s) => [
      {
        x: s.col,
        y: s.row,
        key: s.instruction.id + ':in',
        instruction: s.instruction.id,
        input: true,
      },
      ...(s.contact
        ? [
            {
              x: s.col + s.span,
              y: s.row,
              key: s.instruction.id + ':out',
              instruction: s.instruction.id,
              input: false,
            },
          ]
        : []),
    ]),
  });
  for (const count of [1, 3, 9])
    for (const reverse of [false, true]) {
      const base = [...prefix, 'OUT M10'],
        extended = [
          ...prefix,
          ...Array.from({ length: count }, (_, index) => `OUT M${100 + index}`),
          'OUT M10',
        ];
      const source = reverse ? base : extended,
        target = reverse ? extended : base;
      const csv = [
        ['行', 'ステップ', '照合元', 'ステップ', '照合先', '照合結果'],
        ...Array.from({ length: Math.max(source.length, target.length) }, (_, index) => [
          String(index + 1),
          source[index] ? String(index) : '',
          source[index] ?? '',
          target[index] ? String(index) : '',
          target[index] ?? '',
          '不一致',
        ]),
      ]
        .map((row) => row.map((value) => '"' + value + '"').join('\t'))
        .join('\n');
      const p = parseComparison(csv, 'synthetic-independent-output-rows');
      for (const [index, side] of [p, p.comparison!.target].entries()) {
        const n = side.networks[0],
          g = gridLayout(n),
          snapshot = JSON.stringify(g);
        assert.deepEqual(n.warnings, []);
        assert.deepEqual(
          g.symbols
            .filter((s) => s.contact && s.instruction.operands[0].startsWith('X'))
            .map((s) => s.row),
          [0, 1, 2, 3, 4, 5, 6],
        );
        const coil = g.symbols.find(
          (s) => s.instruction.op === 'OUT' && s.instruction.operands[0] === 'M10',
        )!;
        assert.equal(coil.row, count + 1);
        assert.equal(g.rows, Math.max(7, count + 2));
        assert.equal(
          instructionDrawingOffset(n, coil.instruction.id, 56, 1, 'wrap'),
          (count + 1) * 56,
        );
        for (const mode of ['wrap', 'scroll'] as const) {
          const drawing = displayGrid(n, mode);
          for (const symbol of drawing.symbols.filter((s) => s.contact))
            assert.ok(
              !drawing.wires.some(
                (w) =>
                  w.y1 === symbol.row &&
                  w.y2 === symbol.row &&
                  Math.min(w.x1, w.x2) < symbol.col + symbol.span &&
                  Math.max(w.x1, w.x2) > symbol.col,
              ),
              'moving an output does not bypass a contact',
            );
        }
        const natural = gridLayout(
          comparisonDisplayProgram(p, index === 0 ? 'source' : 'target').networks[0],
        );
        assert.equal(
          natural.symbols.find(
            (s) => s.instruction.op === 'OUT' && s.instruction.operands[0] === 'M10',
          )!.row,
          index === (reverse ? 1 : 0) ? count + 1 : 1,
        );
        assert.equal(
          JSON.stringify(gridLayout(n)),
          snapshot,
          'single-side display does not mutate comparison geometry',
        );
        assert.ok(
          g.symbols
            .filter((s) => s.contact && s.instruction.operands[0].startsWith('X'))
            .every((s) => !s.inputDifference),
          'the parallel contact inputs stay unchanged',
        );
        for (const side of compareConnectionGraphs([terminals(natural)], [terminals(g)]))
          assert.deepEqual(
            side.map(({ wires, inputs, outputs }) => ({ wires, inputs, outputs })),
            [{ wires: [], inputs: [], outputs: [] }],
            'position alignment preserves every electrical connection',
          );
      }
      const natural = ['source', 'target'].map((side) =>
        gridLayout(comparisonDisplayProgram(p, side as 'source' | 'target').networks[0]),
      );
      const comparisonTerminals = (grid: (typeof natural)[number]) => {
        const graph = terminals(grid);
        graph.terminals.forEach((t) => {
          const i =
            p.instructions.find((i) => i.id === t.instruction) ??
            p.comparison!.target.instructions.find((i) => i.id === t.instruction)!;
          t.key = String(i.comparisonRow) + (t.input ? ':in' : ':out');
        });
        return graph;
      };
      const differences = compareConnectionGraphs(
        [comparisonTerminals(natural[0])],
        [comparisonTerminals(natural[1])],
      );
      for (const [side, grid] of natural.entries())
        assert.deepEqual(
          grid.wires.flatMap((w, index) => (w.difference ? [index] : [])),
          differences[side][0].wires,
          'single-side colors follow its natural wire geometry',
        );
    }
});
