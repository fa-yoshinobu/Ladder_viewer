import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProgram, type Network } from '../src/model.ts';
import { parseComparison } from '../src/comparison.ts';
import {
  CELL,
  COLUMNS,
  LADDER_WIDTH,
  LEFT_GUTTER,
  PAGE_GAP,
  ROW,
  SCROLLBAR_HEIGHT,
  displayGrid,
  drawingPages,
  drawingMetrics,
  gridLayout,
  networkSize,
} from '../src/layout.ts';
import {
  NetworkDrawing,
  drawingHeight,
  instructionDrawingOffset,
  networkPrefix,
} from '../src/NetworkDrawing.tsx';
import { HorizontalScroll } from '../src/HorizontalScroll.tsx';
import { comparisonDisplayProgram } from '../src/comparisonDisplay.ts';
import { MasterControlScope } from '../src/MasterControlScope.tsx';
import { ControlFlowScope } from '../src/ControlFlowScope.tsx';

const normal = (commands: string[]) =>
  parseProgram(
    [
      'ステップ番号\t命令\tI/O(デバイス)',
      ...commands.flatMap((command, index) => {
        const [op, ...args] = command.split(' ');
        return [
          [String(index), op, args[0] ?? ''],
          ...args.slice(1).map((arg) => ['', '', arg]),
        ].map((row) => row.join('\t'));
      }),
    ].join('\n'),
    'synthetic.csv',
  ).networks[0];
const longCommands = [
  'LD X0',
  'MPS',
  'OUT Y0',
  'MPP',
  ...Array.from({ length: 13 }, (_, i) => `AND X${i + 1}`),
  'LD X80',
  'OR X81',
  'ANB',
  'OUT Y1',
];
const comparison = (source: string[], target: string[]) =>
  parseComparison(
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
      .join('\n'),
    'synthetic-comparison.csv',
  );
const drawing = (
  network: Network,
  viewMode: 'wrap' | 'scroll',
  zoom = 1,
  scrollContainer = true,
) => {
  const vnode = NetworkDrawing({
    network,
    viewMode,
    zoom,
    rowHeight: ROW,
    selected: '',
    choose: () => {},
    comments: {},
    showComments: true,
    scrollContainer,
  });
  assert.equal(vnode.type, HorizontalScroll);
  return HorizontalScroll(vnode.props as Parameters<typeof HorizontalScroll>[0]);
};

test('short circuits keep exactly the same dimensions and unwrapped container in either mode', () => {
  const n = normal(['LD X0', 'OUT Y0']);
  assert.equal(gridLayout(n).pages, 1);
  assert.equal(displayGrid(n, 'scroll'), gridLayout(n));
  assert.equal(displayGrid(n, 'wrap'), gridLayout(n));
  for (const rowHeight of [ROW, 84]) {
    assert.deepEqual(networkSize(n, rowHeight, 'scroll'), networkSize(n, rowHeight));
    assert.deepEqual(networkSize(n, rowHeight, 'wrap'), { width: LADDER_WIDTH, height: rowHeight });
  }
  for (const zoom of [0.5, 1.4]) {
    assert.equal(drawingHeight(n, ROW, zoom, 'scroll'), drawingHeight(n, ROW, zoom, 'wrap'));
    assert.notEqual(drawing(n, 'scroll', zoom).props.class, 'network-scroll');
  }
});

test('long circuits use one compact page without losing branch symbols or changing the canonical grid', () => {
  const n = normal(longCommands),
    g = gridLayout(n),
    before = JSON.stringify(g);
  assert.deepEqual(n.warnings, []);
  assert.ok(g.pages > 1);
  assert.ok(
    g.wires.some((w) => w.x1 === w.x2 && w.y1 !== w.y2),
    'fixture contains a real branch',
  );
  for (const wire of g.wires) Object.freeze(wire);
  Object.freeze(g.wires);
  Object.freeze(g.symbols);
  const display = displayGrid(n, 'scroll'),
    pages = drawingPages(display, ROW, 'scroll');
  const contactEnd = Math.max(...g.symbols.filter((s) => s.contact).map((s) => s.col + s.span));
  const columns = Math.max(
    COLUMNS,
    contactEnd + Math.max(...g.symbols.filter((s) => !s.contact).map((s) => s.span)),
  );
  assert.equal(pages.length, 1);
  assert.equal(pages[0].left, 0);
  assert.equal(pages[0].top, 0);
  assert.equal(pages[0].width, columns * CELL);
  assert.equal(
    drawingPages(g, ROW, 'scroll')[0].width,
    pages[0].width,
    'geometry agrees even when passed a canonical grid',
  );
  const visible = display.symbols.filter(
    (s) =>
      s.col * CELL >= pages[0].left && (s.col + s.span) * CELL <= pages[0].left + pages[0].width,
  );
  const expected = n.instructions.filter((i) => !['MPS', 'MPP', 'ANB'].includes(i.op));
  assert.deepEqual(visible.map((s) => s.instruction.id).sort(), expected.map((i) => i.id).sort());
  assert.deepEqual(
    pages[0].outputs.map((s) => s.instruction.id),
    n.actions.map((a) => a.instruction.id),
  );
  assert.ok(
    pages[0].outputs.every((s) => (s.col + s.span) * CELL === pages[0].width),
    'all output ends share the compact right edge',
  );
  assert.deepEqual(networkSize(n, 84, 'scroll'), {
    width: LEFT_GUTTER + columns * CELL + 16,
    height: g.rows * 84,
  });
  assert.deepEqual(
    drawingPages(g, 84, 'wrap').map((page) => page.rows),
    [2, 3],
  );
  assert.deepEqual(networkSize(n, 84, 'wrap'), {
    width: LADDER_WIDTH,
    height: 5 * 84 + 2 * PAGE_GAP,
  });
  assert.equal(drawingPages(g, ROW, 'wrap').length, g.pages);
  assert.equal(gridLayout(n), g, 'canonical layout remains cached');
  assert.equal(displayGrid(n, 'wrap'), g, 'wrapping uses the canonical object');
  assert.equal(JSON.stringify(g), before, 'no canonical wire, coordinate or symbol is changed');
});
test('scrollbars reserve 16 CSS pixels regardless of zoom and can be owned by a comparison group', () => {
  const n = normal(longCommands);
  n.title = '一行目\n二行目';
  n.warnings = ['架空の注意'];
  for (const zoom of [0.5, 1.4]) {
    const size = networkSize(n, ROW, 'scroll');
    const contentHeight = size.height * zoom + 2 * 18 * zoom + 25;
    assert.equal(drawingHeight(n, ROW, zoom, 'scroll'), contentHeight + SCROLLBAR_HEIGHT);
    assert.equal(drawingHeight(n, ROW, zoom, 'scroll', false), contentHeight);
    const wrapped = drawing(n, 'scroll', zoom);
    assert.equal(wrapped.props.class, 'network-scroll');
    assert.deepEqual(wrapped.props.style, {
      width: LADDER_WIDTH * zoom,
      height: contentHeight + SCROLLBAR_HEIGHT,
    });
    const inner = wrapped.props.children;
    assert.equal(inner.props.style.width, size.width * zoom);
    assert.notEqual(
      drawing(n, 'scroll', zoom, false).props.class,
      'network-scroll',
      'a group owns only one scrollbar',
    );
    assert.notEqual(drawing(n, 'wrap', zoom).props.class, 'network-scroll');
  }
});

test('switching comparison modes preserves row padding, command differences and wire difference indices', () => {
  const source = [
    'LD X0',
    'MPS',
    'AND X1',
    'OUT Y1',
    'MPP',
    ...Array.from({ length: 13 }, (_, i) => `AND X${i + 20}`),
    'OUT Y2',
  ];
  const target = [
    'LD X0',
    'MPS',
    'AND X1',
    'OUT Y1',
    'MRD',
    'AND X9',
    'OUT Y9',
    'MPP',
    ...Array.from({ length: 13 }, (_, i) => `AND X${i + 20}`),
    'OUT Y2',
  ];
  const p = comparison(source, target),
    sides = [p, p.comparison!.target];
  const before = JSON.stringify(sides);
  for (const side of sides)
    for (const network of side.networks) {
      const snapshot = JSON.stringify(gridLayout(network));
      assert.ok(gridLayout(network).pages > 1);
      for (const mode of ['scroll', 'wrap', 'scroll'] as const) {
        const g = gridLayout(network),
          size = networkSize(network, ROW, mode);
        assert.equal(
          size.height,
          mode === 'scroll' ? g.rows * ROW : g.pages * g.rows * ROW + g.pages * PAGE_GAP,
        );
        drawingPages(displayGrid(network, mode), ROW, mode);
        drawing(network, mode);
        assert.equal(JSON.stringify(gridLayout(network)), snapshot);
      }
    }
  const row = (side: typeof p, operand: string) =>
    gridLayout(side.networks[0]).symbols.find(
      (s) => s.instruction.op === 'OUT' && s.instruction.operands[0] === operand,
    )!.row;
  assert.equal(row(p, 'Y1'), row(p.comparison!.target, 'Y1'));
  assert.equal(row(p, 'Y2'), row(p.comparison!.target, 'Y2'));
  assert.ok(row(p, 'Y2') > row(p, 'Y1') + 1, 'the inserted branch still reserves its row');
  assert.ok(
    sides.some((side) => side.networks.some((n) => n.connectionDifferences?.wires.length)),
    'fixture contains connection differences',
  );
  assert.equal(JSON.stringify(sides), before, 'rowAlignment and difference metadata stay intact');
});

test('twelve contact columns plus a three-column command occupy fifteen columns, not twenty-four', () => {
  const n = normal([
    'LD X0',
    'MPS',
    'OUT Y0',
    'MPP',
    ...Array.from({ length: 11 }, (_, i) => `AND X${i + 1}`),
    'MPS',
    'OUT Y1',
    'MPP',
    'MOV K1 D0',
  ]);
  const canonical = gridLayout(n),
    before = JSON.stringify(canonical),
    display = displayGrid(n, 'scroll');
  assert.deepEqual(n.warnings, []);
  assert.deepEqual(
    canonical.symbols.filter((s) => !s.contact).map((s) => [s.col, s.span]),
    [
      [11, 1],
      [23, 1],
      [21, 3],
    ],
  );
  assert.equal(display.width, LEFT_GUTTER + 15 * CELL + 16);
  assert.equal(display.pages, canonical.pages);
  assert.deepEqual(
    display.symbols.filter((s) => !s.contact).map((s) => [s.col, s.span]),
    [
      [14, 1],
      [14, 1],
      [12, 3],
    ],
  );
  assert.deepEqual(
    display.symbols.filter((s) => s.contact),
    canonical.symbols.filter((s) => s.contact),
  );
  assert.deepEqual(
    display.wires.slice(0, canonical.wires.length).filter((w) => w.x1 === w.x2 && w.y1 !== w.y2),
    canonical.wires.filter((w) => w.x1 === w.x2 && w.y1 !== w.y2),
  );
  const longOutput = canonical.symbols.find(
    (s) => !s.contact && s.instruction.operands[0] === 'Y1',
  )!;
  const index = canonical.wires.findIndex(
    (w) => w.y1 === longOutput.row && w.y2 === longOutput.row && w.x2 === longOutput.col,
  );
  assert.ok(index >= 0);
  assert.equal(display.wires[index].x2, 14);
  assert.equal(JSON.stringify(canonical), before);
  assert.equal(gridLayout(n), canonical);
});

test('contact terminals and branch junctions stay fixed while missing input lines are extended with their difference color', () => {
  const fixtures = [
    [
      'LD X0',
      ...Array.from({ length: 10 }, (_, i) => `AND X${i + 1}`),
      'MPS',
      'OUT Y0',
      'MPP',
      'AND X11',
      'MOV K1 D0',
    ],
    [
      'LD X0',
      'LD X1',
      ...Array.from({ length: 10 }, (_, i) => `AND X${i + 2}`),
      'ORB',
      'MPS',
      'OUT Y0',
      'MPP',
      'AND X12',
      'MOV K1 D0',
    ],
  ];
  for (const [caseIndex, commands] of fixtures.entries()) {
    const n = normal(commands),
      base = gridLayout(n),
      output = base.symbols.find((s) => !s.contact && s.instruction.operands[0] === 'Y0')!;
    assert.equal(output.col, 11);
    assert.ok(base.pages > 1);
    const horizontal = base.wires.findIndex(
      (w) => w.y1 === output.row && w.y2 === output.row && w.x2 === output.col,
    );
    assert.equal(
      horizontal >= 0,
      caseIndex === 1,
      'one case has no input line, the other ends at a branch junction',
    );
    assert.ok(
      base.wires.some(
        (w) =>
          w.x1 === 11 &&
          w.x2 === 11 &&
          Math.min(w.y1, w.y2) <= output.row &&
          output.row <= Math.max(w.y1, w.y2),
      ),
    );
    n.connectionDifferences = {
      kind: 'removed',
      wires: [0, base.wires.length - 1],
      inputs: [output.instruction.id],
      outputs: [],
    };
    const canonical = gridLayout(n),
      snapshot = JSON.stringify(canonical),
      metadata = JSON.stringify(n.connectionDifferences),
      display = displayGrid(n, 'scroll');
    assert.equal(display.width, LEFT_GUTTER + 15 * CELL + 16);
    if (horizontal >= 0)
      assert.deepEqual(
        display.wires[horizontal],
        canonical.wires[horizontal],
        'the existing junction line keeps its old endpoint',
      );
    for (let i = 0; i < canonical.wires.length; i++) {
      assert.equal(
        display.wires[i].difference,
        canonical.wires[i].difference,
        'canonical difference indices retain their kind',
      );
      if (canonical.wires[i].x1 === canonical.wires[i].x2)
        assert.deepEqual(
          display.wires[i],
          canonical.wires[i],
          'vertical branch coordinates stay fixed',
        );
    }
    assert.ok(
      display.wires
        .slice(canonical.wires.length)
        .some(
          (w) =>
            w.x1 === 11 &&
            w.y1 === output.row &&
            w.x2 === 14 &&
            w.y2 === output.row &&
            w.difference === 'removed',
        ),
      'a new input extension carries the symbol input difference',
    );
    assert.deepEqual(
      display.symbols.filter((s) => s.contact),
      canonical.symbols.filter((s) => s.contact),
    );
    assert.equal(JSON.stringify(gridLayout(n)), snapshot);
    assert.equal(JSON.stringify(n.connectionDifferences), metadata);
  }
});

test('FB output width, pins and aligned rows survive compact display', () => {
  const n = normal([
    'LD X0',
    ...Array.from({ length: 11 }, (_, i) => `AND X${i + 1}`),
    'MOV K1 D0',
  ]);
  const fb = n.actions[0].instruction;
  fb.op = 'FBCALL Synthetic';
  fb.operands = [];
  fb.pins = [{ ...fb, id: 'synthetic-pin', op: 'Synthetic IN:Value', operands: ['D0'] }];
  const canonical = gridLayout(n),
    snapshot = JSON.stringify(canonical),
    display = displayGrid(n, 'scroll');
  const symbol = display.symbols.find((s) => !s.contact)!;
  assert.equal(symbol.span, 5);
  assert.equal(symbol.col, 12);
  assert.equal(symbol.col + symbol.span, 17);
  assert.equal(display.width, LEFT_GUTTER + 17 * CELL + 16);
  assert.equal(display.rows, canonical.rows);
  assert.equal(symbol.instruction, fb);
  assert.equal(symbol.instruction.pins, fb.pins);
  assert.deepEqual(networkSize(n, 84, 'scroll'), {
    width: display.width,
    height: canonical.rows * 84,
  });
  assert.equal(JSON.stringify(gridLayout(n)), snapshot);
});

test('scroll mode removes a two-column comparison boundary gap while preserving wire indices and colors', () => {
  const n = normal([
    'LD X0',
    ...Array.from({ length: 12 }, (_, index) => `AND<= K${index} D${index * 2}`),
    'OUT Y0',
  ]);
  const base = gridLayout(n);
  n.connectionDifferences = {
    kind: 'removed',
    wires: [0],
    inputs: [n.actions[0].instruction.id],
    outputs: [],
  };
  const canonical = gridLayout(n),
    snapshot = JSON.stringify(canonical),
    display = displayGrid(n, 'scroll');
  assert.equal(base.pages, 4);
  assert.equal(canonical.rows, 1);
  assert.deepEqual(canonical.wires[0], { x1: 10, y1: 0, x2: 12, y2: 0, difference: 'removed' });
  assert.deepEqual(
    display.symbols.filter((s) => s.contact).map((s) => s.col),
    [0, 1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34],
  );
  assert.deepEqual(
    display.symbols.map((s) => [s.instruction.id, s.span, s.row]),
    canonical.symbols.map((s) => [s.instruction.id, s.span, s.row]),
  );
  assert.equal(display.width, LEFT_GUTTER + 38 * CELL + 16);
  assert.equal(display.pages, canonical.pages);
  assert.equal(display.symbols.find((s) => !s.contact)!.col, 37);
  assert.equal(display.wires.length, canonical.wires.length);
  assert.deepEqual(
    display.wires[0],
    { x1: 10, y1: 0, x2: 10, y2: 0, difference: 'removed' },
    'a collapsed wire retains its original array slot and color',
  );
  for (let index = 0; index < canonical.wires.length; index++)
    assert.equal(display.wires[index].difference, canonical.wires[index].difference);
  assert.equal(networkSize(n, ROW, 'scroll').width, display.width);
  assert.equal(drawingPages(display, ROW, 'scroll')[0].width, 38 * CELL);
  assert.equal(display.symbols.find((s) => !s.contact)!.inputDifference, 'removed');
  assert.equal(JSON.stringify(gridLayout(n)), snapshot);
  assert.deepEqual(displayGrid(n, 'wrap'), canonical);
});

const sparseWrappedCommands = [
  'LD X0',
  'AND X1',
  'AND X2',
  'ANI M10',
  'LD<= R0 D0',
  ...Array.from({ length: 5 }, (_, index) => `OR>= R${index + 1} D${index + 1}`),
  'ANB',
  'OR M10',
  'ANI X8',
  'ANI X9',
  'AND X3',
  'MPS',
  'ANI M10',
  'MOV K1 D0',
  'MPP',
  'OUT M10',
];

test('wrapped pages trim unused trailing rows and navigation uses their cumulative heights', () => {
  const n = normal(sparseWrappedCommands),
    g = gridLayout(n),
    snapshot = JSON.stringify(g);
  assert.equal(g.rows, 7);
  assert.equal(g.pages, 2);
  const owner = g.symbols.find((s) => s.instruction.op === 'MOV')!;
  for (const rowHeight of [ROW, 84]) {
    const pages = drawingPages(g, rowHeight, 'wrap');
    assert.deepEqual(
      pages.map((page) => page.rows),
      [7, 1],
    );
    assert.deepEqual(
      pages.map((page) => page.top),
      [0, 7 * rowHeight + PAGE_GAP],
    );
    assert.deepEqual(networkSize(n, rowHeight, 'wrap'), {
      width: LADDER_WIDTH,
      height: 8 * rowHeight + 2 * PAGE_GAP,
    });
    assert.equal(
      instructionDrawingOffset(n, owner.instruction.id, rowHeight, 1.25, 'wrap'),
      pages[1].top * 1.25,
    );
    assert.equal(networkSize(n, rowHeight, 'scroll').height, 7 * rowHeight);
  }
  assert.equal(
    JSON.stringify(gridLayout(n)),
    snapshot,
    'page compaction does not change symbols, wires or difference indices',
  );
  const branch = { ...g, wires: [...g.wires, { x1: 13, y1: 0, x2: 13, y2: 6 }] };
  assert.deepEqual(
    drawingPages(branch, ROW, 'wrap').map((page) => page.rows),
    [7, 7],
    'a wire-only vertical branch must remain visible',
  );
});

test('a sparse wrapped page retains the complete height of a multi-row output', () => {
  const n = normal(sparseWrappedCommands),
    owner = n.actions[0].instruction;
  owner.pins = Array.from({ length: 6 }, (_, index) => ({
    id: `synthetic-pin-${index}`,
    sourceRow: 100 + index,
    step: '',
    op: 'Dummy IN:Value',
    operands: [`D${index}`],
    note: '',
    statement: '',
  }));
  const g = gridLayout(n),
    pages = drawingPages(g, ROW, 'wrap');
  assert.deepEqual(
    pages.map((page) => page.rows),
    [7, 4],
  );
  assert.equal(networkSize(n, ROW, 'wrap').height, 11 * ROW + 2 * PAGE_GAP);
});

test('comparison shares only the page heights needed to align matching wrapped commands', () => {
  const before = [
    'LD X0',
    'LD X10',
    ...Array.from({ length: 5 }, (_, index) => `OR X${index + 11}`),
    'ANB',
    ...Array.from({ length: 14 }, (_, index) => `AND X${index + 30}`),
    'MOV K1 D0',
  ];
  const after = before.filter(
    (command) => !['OR X12', 'OR X13', 'OR X14', 'OR X15'].includes(command),
  );
  const p = comparison(before, after),
    grids = [p, p.comparison!.target].map((side) => gridLayout(side.networks[0]));
  assert.deepEqual(
    grids.map((g) => g.rows),
    [6, 2],
  );
  const offsets = [p, p.comparison!.target].map((side) => {
    const n = side.networks[0],
      g = gridLayout(n),
      owner = g.symbols.find((s) => s.instruction.op === 'MOV')!;
    assert.deepEqual(
      drawingPages(g, ROW, 'wrap').map((page) => page.rows),
      [6, 1],
    );
    assert.equal(networkSize(n, ROW, 'wrap').height, 7 * ROW + 2 * PAGE_GAP);
    return instructionDrawingOffset(n, owner.instruction.id, ROW, 1, 'wrap');
  });
  assert.deepEqual(offsets, [6 * ROW + PAGE_GAP, 6 * ROW + PAGE_GAP]);
  const natural = comparisonDisplayProgram(p, 'target').networks[0];
  assert.deepEqual(
    drawingPages(gridLayout(natural), ROW, 'wrap').map((page) => page.rows),
    [2, 1],
  );
  assert.equal(networkSize(natural, ROW, 'wrap').height, 3 * ROW + 2 * PAGE_GAP);
});

test('third-page navigation and scope endpoints follow compact heights with notes and headers', () => {
  const split = sparseWrappedCommands.indexOf('MOV K1 D0');
  const n = normal([
    ...sparseWrappedCommands.slice(0, split),
    ...Array.from({ length: 14 }, (_, index) => `AND X${index + 200}`),
    ...sparseWrappedCommands.slice(split),
  ]);
  const owner = n.actions[0].instruction;
  owner.note = 'Dummy note\nDummy continuation';
  n.title = 'Dummy title';
  n.warnings = ['Dummy warning'];
  const g = gridLayout(n),
    metrics = drawingMetrics(n, ROW),
    pages = drawingPages(g, metrics.rowHeight, 'wrap'),
    zoom = 1.25,
    prefix = networkPrefix(n, zoom);
  assert.deepEqual(
    pages.map((page) => page.rows),
    [7, 1, 1],
  );
  const top = 8 * metrics.rowHeight + 2 * PAGE_GAP;
  assert.equal(pages[2].top, top);
  assert.equal(instructionDrawingOffset(n, owner.id, ROW, zoom, 'wrap'), prefix + top * zoom);
  const props = {
    network: n,
    zoom,
    rowHeight: ROW,
    viewMode: 'wrap' as const,
    width: LADDER_WIDTH * zoom,
    height: drawingHeight(n, ROW, zoom),
    prefix,
  };
  const end = prefix + (top + metrics.baseline + 12) * zoom;
  const scopes = [
    MasterControlScope({
      ...props,
      ranges: [{ start: n.instructions[0], end: owner, level: 0, lane: 0 }],
    }),
    ControlFlowScope({
      ...props,
      ranges: [{ kind: 'STFOR', start: n.instructions[0], end: owner, lane: 0, branches: [] }],
    }),
  ];
  for (const scope of scopes)
    assert.ok(scope.props.children[0].props.children[1].props.d.includes(`V${end}`));
});

test('a long three-branch condition places three shared outputs on consecutive rows', () => {
  const network = normal([
    'LD X0',
    'LD X1',
    'OR X2',
    'OR X3',
    'ANB',
    ...Array.from({ length: 13 }, (_, index) => `AND X${index + 30}`),
    'OUT Y0',
    'OUT T0 K5',
    'MOV K1 D0',
  ]);
  const canonical = gridLayout(network),
    before = JSON.stringify(canonical);
  assert.deepEqual(network.warnings, []);
  assert.ok(canonical.pages > 1);
  assert.ok(canonical.wires.some((w) => w.x1 === w.x2 && w.y1 !== w.y2));
  for (const mode of ['wrap', 'scroll'] as const) {
    const drawing = displayGrid(network, mode),
      outputs = drawing.symbols.filter((s) => !s.contact);
    assert.deepEqual(
      outputs.map((s) => s.row),
      [0, 1, 2],
    );
    assert.deepEqual(
      outputs.map((s) => [s.instruction.op, ...s.instruction.operands].join(' ')),
      ['OUT Y0', 'OUT T0 K5', 'MOV K1 D0'],
    );
  }
  assert.equal(JSON.stringify(canonical), before);
});
