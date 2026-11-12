import { requireValue } from '../src/requireValue';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseKeyenceMnm } from '../src/keyence/parser.ts';
import { buildKeyenceNetworks } from '../src/keyence/logic.ts';
import { layoutKeyenceNetwork, keyenceViewDrawing } from '../src/keyence/layout.ts';
import { keyenceBlockGeometry, keyenceStBoxGeometry } from '../src/keyence/blockGeometry.ts';
import { KeyenceBlock, KeyenceStBox } from '../src/keyence/blocks.tsx';
import { compareKeyencePrograms } from '../src/keyence/comparison.ts';
import { strokeCoordinates } from '../src/drawing.ts';
import type { KeyenceSymbol } from '../src/keyence/layout.ts';

// Original dummy source, independent of the supplied projects and their values.
const parse = (commands: string[]) =>
  parseKeyenceMnm(
    new TextEncoder().encode(['DEVICE:60', ...commands].join('\n')).buffer,
    'dummy-additional.mnm',
  );
const drawing = (commands: string[], showComments = true) => {
  const p = parse(commands);
  return buildKeyenceNetworks(p).map((n) => layoutKeyenceNetwork(n, p, showComments));
};
type Node = { type: string; props: Record<string, any> };
function rendered(value: any): Node[] {
  if (value == null || typeof value === 'boolean') return [];
  if (Array.isArray(value)) return value.flatMap(rendered);
  if (typeof value !== 'object') return [];
  if (typeof value.type === 'function') return rendered(value.type(value.props));
  return [...(typeof value.type === 'string' ? [value] : []), ...rendered(value.props?.children)];
}
function text(value: any): string {
  if (value == null || typeof value === 'boolean') return '';
  if (Array.isArray(value)) return value.map(text).join('');
  if (typeof value !== 'object') return String(value);
  return text(value.props?.children);
}
const render = (s: KeyenceSymbol) =>
  rendered(
    (s.kind === 'st-box' ? KeyenceStBox : KeyenceBlock)({
      symbol: s,
      c: strokeCoordinates(1, 1, 0, 0),
    }),
  );

test('BOX_ST remains a connected output and preserves all wrapped source rows', () => {
  const code = ['DummyValue := 17;', '\tDummyText := "' + 'z'.repeat(160) + '";', ''];
  const d = requireValue(
    drawing(['LD MR11', 'ANB MR12', 'BOX_ST', ...code.map((line) => ';' + line), 'OUT MR13'])[0],
  );
  assert.equal(d.st, undefined);
  assert.equal(d.symbols.length, 4);
  const box = d.symbols.find((s) => s.kind === 'st-box')!,
    shape = keyenceStBoxGeometry(box.instruction);
  assert.equal(box.y, requireValue(d.symbols[0]).y);
  assert.ok(shape.rows.length > code.length);
  assert.ok(d.wires.some((w) => w.y1 === box.y && w.y2 === box.y && w.x2 === box.x));
  const displayed = render(box)
    .filter((n) => n.type === 'text')
    .map(text)
    .join('');
  assert.ok(displayed.includes('z'.repeat(160)));
  assert.ok(displayed.includes('DummyValue := 17;'));
  assert.ok(!displayed.includes('…'));
  assert.ok(d.symbols.at(-1)!.y > box.y + shape.bottom);
  for (const mode of ['wrap', 'scroll'] as const) {
    const view = keyenceViewDrawing(d, mode),
      moved = view.symbols.find((s) => s.kind === 'st-box')!;
    assert.ok(moved.y + shape.top >= 0 && moved.y + shape.bottom < view.height);
    assert.ok(moved.x >= view.left && moved.x + moved.width <= view.width);
  }
});

test('disabled ranges retain their circuit symbols while boundary markers never become boxes', () => {
  const ds = drawing([
    'LD MR1',
    'OUT MR2',
    'DISABLED_RUNG',
    'LD MR3',
    'FUN MOVE DummyInput DummyOutput',
    'OUT MR4',
    'END_DISABLED_RUNG',
    'LD MR5',
    'OUT MR6',
  ]);
  assert.deepEqual(
    ds.map((d) => !!d.network.disabled),
    [false, true, false],
  );
  assert.equal(requireValue(ds[1]).statementLines[0], '無効回路');
  assert.ok(requireValue(ds[1]).symbols.some((s) => s.kind === 'fb'));
  assert.ok(requireValue(ds[1]).wires.length > 0);
  assert.ok(
    ds.flatMap((d) => d.symbols).every((s) => !s.instruction.opcode.includes('DISABLED_RUNG')),
  );
  for (const mode of ['wrap', 'scroll'] as const) {
    const view = keyenceViewDrawing(requireValue(ds[1]), mode);
    assert.equal(view.network.disabled, true);
    assert.equal(view.statementLines[0], '無効回路');
  }
});

test('function comments are visible below the block and hidden comments reserve no comment text', () => {
  const commands = ['LD MR1', 'FUN MOVE DummyInput DummyOutput;Dummy annotation', 'OUT MR2'];
  const visible = requireValue(drawing(commands, true)[0]),
    hidden = requireValue(drawing(commands, false)[0]);
  const block = visible.symbols.find((s) => s.kind === 'fb')!,
    shape = keyenceBlockGeometry(block.instruction.fb!);
  const note = render(block).find((n) => n.type === 'text' && text(n) === 'Dummy annotation')!;
  assert.ok(note);
  assert.ok(note.props.y > block.y + shape.bottom);
  assert.ok(note.props.y + 4 < visible.height);
  assert.ok(visible.symbols.at(-1)!.y > note.props.y);
  assert.ok(
    !render(hidden.symbols.find((s) => s.kind === 'fb')!).some(
      (n) => n.type === 'text' && text(n) === 'Dummy annotation',
    ),
  );
});

test('constant inout pins appear on the input side without inventing an output connection', () => {
  const s = requireValue(
    drawing(['LD MR1', 'FUN DummyFunction DummyConstant DummyMutable'])[0],
  ).symbols.find((s) => s.kind === 'fb')!;
  const fb = s.instruction.fb!;
  fb.knownSignature = true;
  fb.powerInput = 'EN';
  fb.powerOutput = 'ENO';
  fb.pins = fb.pins.map((pin, index) => ({
    ...pin,
    name: index ? 'Mutable' : 'Constant',
    direction: 'inout',
    inputRow: index,
    outputRow: index,
    constant: !index,
  }));
  const shape = keyenceBlockGeometry(fb);
  s.width = shape.width;
  assert.deepEqual(
    shape.pins.filter((p) => p.pin.value === 'DummyConstant').map((p) => p.side),
    ['input'],
  );
  assert.deepEqual(
    shape.pins.filter((p) => p.pin.value === 'DummyMutable').map((p) => p.side),
    ['input', 'output'],
  );
  const values = render(s)
    .filter((n) => n.type === 'text')
    .map(text);
  assert.equal(values.filter((t) => t === 'DummyConstant').length, 1);
  assert.equal(values.filter((t) => t === 'DummyMutable').length, 2);
});

test('BOX_ST comparison highlights only changed source rows inside the frame', () => {
  const commands = [
    'LD MR1',
    'BOX_ST',
    ';DummyChanged := 1;',
    ';DummyUnchanged := TRUE;',
    'OUT MR2',
  ];
  const compared = compareKeyencePrograms(
    parse(commands),
    parse(commands.map((line) => line.replace(':= 1;', ':= 2;'))),
  );
  for (const p of [compared.source, compared.target]) {
    const s = buildKeyenceNetworks(p)
      .flatMap((n) => layoutKeyenceNetwork(n, p).symbols)
      .find((s) => s.kind === 'st-box')!;
    assert.equal(
      render(s).filter(
        (n) => n.type === 'rect' && n.props.class === 'ladder-selection-bg diff-changed',
      ).length,
      1,
    );
    assert.ok(render(s).some((n) => n.type === 'text' && text(n) === 'DummyUnchanged := TRUE;'));
  }
});
