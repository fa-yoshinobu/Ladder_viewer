import test from 'node:test';
import assert from 'node:assert/strict';
import { parseKeyenceMnm } from '../src/keyence/parser.ts';
import {
  keyenceScriptRegions,
  keyenceScriptNetworks,
  keyenceScriptComparison,
  keyenceVisibleInstructions,
} from '../src/keyence/scriptDisplay.ts';
import {
  layoutKeyenceNetwork,
  keyenceViewDrawing,
  keyenceSymbolOwns,
} from '../src/keyence/layout.ts';
import { compareKeyencePrograms, keyenceComparisonDrawings } from '../src/keyence/comparison.ts';
import { keyenceCompareDrawing } from '../src/keyence/compareDrawing.tsx';
import { keyenceInstructionCopyText } from '../src/keyence/instructionCopy.ts';
import { blockRangeText } from '../src/blockRangeCopy.ts';

// Independently invented source and addresses; no user program is a fixture.
const source = "'Dummy calculation\n\tDummyTotal = DummyInput + #17";
const script = (label = '#831', code = source) => [
  ...code.split('\n').map((s) => ';' + s),
  'LD MR830',
  'NCJ ' + label,
  ...code.split('\n').map((s) => ';' + s),
  'LD CR2002',
  'LDA DM831',
  'CON',
  'ADD #17',
  'CON',
  'STA DM832',
  'LABEL ' + label,
];
const parse = (lines: string[]) =>
  parseKeyenceMnm(
    new TextEncoder().encode(
      ['DEVICE:57', ';MODULE:DummyDisplay', ';SCRIPT_TYPE:', ...lines].join('\n'),
    ).buffer,
    'dummy.mnm',
  );
const p = () =>
  parse([
    ';Dummy section',
    ...script(),
    'LD MR833',
    'OUT MR834',
    ...script('#835', source.replaceAll('DummyTotal', 'DummyOther')),
    'END',
  ]);

test('folded scripts show original source and guards without altering any parsed command', () => {
  const program = p(),
    snapshot = JSON.stringify(program),
    regions = keyenceScriptRegions(program),
    networks = keyenceScriptNetworks(program);
  assert.equal(regions.length, 2);
  assert.equal(networks.filter((n) => n.script).length, 2);
  const first = networks[0],
    box = first.instructions.find((i) => i.st)!;
  assert.equal(first.statement, 'Dummy section');
  assert.equal(box.st?.lines.map((l) => l.text).join('\n'), source);
  assert.equal(first.instructions[0].opcode, 'LD');
  assert.equal(first.actions[0].instruction, box);
  assert.equal(first.actions[0].condition?.kind, 'contact');
  assert.deepEqual(
    networks.flatMap((n) => keyenceVisibleInstructions(n, program).map((i) => i.id)),
    program.instructions.map((i) => i.id),
  );
  assert.equal(keyenceInstructionCopyText(box, program), source.replaceAll('\n', '\r\n'));
  assert.ok(
    blockRangeText([first]).includes(String(program.instructions[regions[0].endIndex].sourceLine)),
  );
  const drawing = layoutKeyenceNetwork(first, program),
    symbol = drawing.symbols.find((s) => s.instruction.st)!;
  assert.equal(keyenceSymbolOwns(symbol, program.instructions[regions[0].jumpIndex + 3].id), true);
  for (const mode of ['wrap', 'scroll'] as const) {
    const d = keyenceViewDrawing(drawing, mode);
    assert.ok(
      [d.width, d.height, ...d.symbols.flatMap((s) => [s.x, s.y, s.width])].every(Number.isFinite),
    );
  }
  assert.equal(JSON.stringify(program), snapshot);
});

test('expansion is independent per script and preserves the following ordinary circuit', () => {
  const program = p(),
    [first, second] = keyenceScriptRegions(program),
    expanded = keyenceScriptNetworks(program, new Set([first.id]));
  assert.equal(expanded.filter((n) => n.script?.expanded).length, 1);
  assert.equal(expanded.filter((n) => n.script && !n.script.expanded).length, 1);
  assert.ok(expanded.some((n) => n.instructions.some((i) => i.raw === 'ADD #17')));
  assert.ok(expanded.some((n) => n.instructions.some((i) => i.raw === 'OUT MR834')));
  const all = keyenceScriptNetworks(program, new Set([first.id, second.id]));
  assert.deepEqual(
    all.flatMap((n) => n.instructions.map((i) => i.raw)),
    program.instructions.map((i) => i.raw),
  );
  assert.equal(all[0].statement, 'Dummy section');
  const folded = keyenceScriptNetworks(program);
  assert.ok(folded.length < all.length);
  assert.equal(folded.filter((n) => n.script?.expanded).length, 0);
  assert.equal(folded.filter((n) => n.instructions.some((i) => i.st)).length, 2);
});

test('expanded range markers cover each complete script and stop before ordinary or folded circuits', () => {
  const program = p(),
    regions = keyenceScriptRegions(program),
    snapshot = JSON.stringify(program);
  assert.ok(keyenceScriptNetworks(program).every((n) => !n.scriptRange));
  for (const active of [[regions[0]], [regions[1]], regions]) {
    const networks = keyenceScriptNetworks(program, new Set(active.map((r) => r.id)));
    for (const region of active) {
      const marked = networks.filter((n) => n.scriptRange?.id === region.id);
      assert.ok(marked.length > 1);
      assert.deepEqual(
        marked.flatMap((n) => n.instructions.map((i) => i.id)),
        program.instructions.slice(region.guardStartIndex, region.endIndex + 1).map((i) => i.id),
      );
      assert.deepEqual(
        marked.map((n) => n.scriptRange!.start),
        marked.map((_, i) => i === 0),
      );
      assert.deepEqual(
        marked.map((n) => n.scriptRange!.end),
        marked.map((_, i) => i === marked.length - 1),
      );
      for (const mode of ['wrap', 'scroll'] as const)
        for (const network of marked) {
          const drawing = keyenceViewDrawing(layoutKeyenceNetwork(network, program), mode);
          assert.deepEqual(drawing.network.scriptRange, network.scriptRange);
        }
    }
    assert.ok(
      networks
        .filter((n) => n.instructions.some((i) => i.raw === 'OUT MR834' || i.st))
        .every((n) => !n.scriptRange),
    );
  }
  const comparison = compareKeyencePrograms(program, program),
    folded = keyenceScriptComparison(comparison, new Set());
  const id = folded.groups[0].source[0].script!.id,
    expanded = keyenceScriptComparison(comparison, new Set([id]));
  for (const side of ['source', 'target'] as const) {
    const marked = expanded.groups.flatMap((g) => g[side]).filter((n) => n.scriptRange);
    assert.ok(marked.length > 1);
    assert.ok(marked.every((n) => n.scriptRange!.id === id));
    assert.equal(marked.filter((n) => n.scriptRange!.start).length, 1);
    assert.equal(marked.filter((n) => n.scriptRange!.end).length, 1);
  }
  assert.equal(JSON.stringify(program), snapshot);
});

test('comparison folds complete script groups, synchronizes expansion, and retains every change and search target', () => {
  const left = p(),
    right = parse([
      ';Dummy section',
      ...script().map((s) => (s === 'ADD #17' ? 'ADD #19' : s)),
      'LD MR833',
      'OUT MR834',
      ...script('#835', source.replaceAll('DummyTotal', 'DummyOther')),
      'END',
    ]);
  const comparison = compareKeyencePrograms(left, right),
    snapshot = JSON.stringify(comparison);
  const folded = keyenceScriptComparison(comparison, new Set()),
    group = folded.groups.find((g) => g.source.some((n) => n.script))!;
  const a = group.source.find((n) => n.script)!,
    b = group.target.find((n) => n.script)!;
  assert.equal(a.script!.id, b.script!.id);
  assert.equal(a.script?.hiddenDifference, true);
  assert.equal(a.actions[0].instruction.difference?.kind, 'changed');
  assert.equal(folded.groups.flatMap((g) => g.changes).length, comparison.changes.length);
  for (const side of ['source', 'target'] as const) {
    const ids = folded.groups.flatMap((g) =>
      g[side].flatMap((n) => keyenceVisibleInstructions(n, comparison[side]).map((i) => i.id)),
    );
    assert.deepEqual(
      ids,
      comparison[side].instructions.map((i) => i.id),
    );
    assert.equal(new Set(ids).size, ids.length);
  }
  const expanded = keyenceScriptComparison(comparison, new Set([a.script!.id]));
  for (const side of ['source', 'target'] as const)
    assert.equal(
      expanded.groups.flatMap((g) => g[side]).filter((n) => n.script?.expanded).length,
      1,
    );
  for (const mode of ['wrap', 'scroll'] as const)
    for (const c of [folded, expanded])
      for (const g of keyenceComparisonDrawings(c, true, mode))
        for (const d of [...g.source, ...g.target])
          assert.ok(
            [d.height, ...d.symbols.flatMap((s) => [s.x, s.y, s.width])].every(Number.isFinite),
          );
  const drawing = keyenceCompareDrawing(comparison, true, 1, 'wrap', 'both');
  const changedId = comparison.changes[0].source!.id;
  assert.ok(drawing.some((g) => g.source.some((c) => c.locations.some((l) => l.id === changedId))));
  assert.equal(JSON.stringify(comparison), snapshot);
});

test('source-only changes highlight the script without coloring the unchanged guard contact', () => {
  const left = parse(script()),
    right = parse(script('#831', source.replaceAll('DummyTotal', 'DummySum')));
  const compared = keyenceScriptComparison(compareKeyencePrograms(left, right), new Set());
  const network = compared.groups[0].source[0];
  assert.equal(network.instructions[0].difference, undefined);
  assert.equal(network.actions[0].instruction.difference?.kind, 'changed');
  assert.equal(network.script?.hiddenDifference, false);
  assert.equal(
    network.actions[0].instruction.difference?.otherText,
    source.replaceAll('DummyTotal', 'DummySum'),
  );
});

test('three versus two script regions toggle independently inside a merged comparison group', () => {
  const partitioned = (parts: number[][]) =>
    parse([
      ...parts.flatMap((values, index) => [
        ...values.map((value) => `;DM889 = #${value}`),
        'LD MR889',
        `NCJ #${900 + index}`,
        ...values.flatMap((value) => [`;DM889 = #${value}`, 'LD CR2002', `MOV #${value} DM889`]),
        `LABEL #${900 + index}`,
      ]),
      'END',
    ]);
  const three = partitioned([[1], [2], [3, 4]]),
    two = partitioned([
      [1, 2],
      [3, 4],
    ]),
    sides = ['source', 'target'] as const;
  for (const [left, right] of [
    [three, two],
    [two, three],
  ]) {
    const comparison = compareKeyencePrograms(left, right),
      folded = keyenceScriptComparison(comparison, new Set());
    assert.ok(
      folded.groups.some((group) =>
        sides.some((side) => group[side].filter((n) => n.script).length > 1),
      ),
    );
    const keys = sides.map((side) =>
      folded.groups.flatMap((g) => g[side]).flatMap((n) => (n.script ? [n.script.id] : [])),
    );
    for (const ids of keys)
      assert.equal(
        new Set(ids).size,
        ids.length,
        'neighboring scripts must have different toggle identities',
      );
    assert.ok(
      keys[0].some((id) => keys[1].includes(id)),
      'confirmed counterparts share a toggle identity',
    );
    for (const id of new Set(keys.flat())) {
      const expanded = keyenceScriptComparison(comparison, new Set([id]));
      for (const [index, side] of sides.entries()) {
        const networks = expanded.groups.flatMap((g) => g[side]);
        assert.deepEqual(
          networks.filter((n) => n.script?.expanded).map((n) => n.script!.id),
          keys[index].includes(id) ? [id] : [],
        );
        assert.deepEqual(
          networks.flatMap((n) => keyenceVisibleInstructions(n, comparison[side]).map((i) => i.id)),
          comparison[side].instructions.map((i) => i.id),
        );
      }
      assert.deepEqual(
        expanded.groups.flatMap((g) => g.changes),
        comparison.changes,
      );
    }
  }
});

test('a script on only one comparison side stays complete and ordinary ST remains unchanged', () => {
  const before = parse(['LD MR840', 'OUT MR841', 'END']),
    after = parse([...script(), 'LD MR840', 'OUT MR841', 'END']);
  for (const [a, b] of [
    [before, after],
    [after, before],
  ]) {
    const c = compareKeyencePrograms(a, b),
      d = keyenceScriptComparison(c, new Set());
    assert.equal(d.groups.flatMap((g) => g.changes).length, c.changes.length);
    for (const side of ['source', 'target'] as const)
      assert.deepEqual(
        d.groups.flatMap((g) =>
          g[side].flatMap((n) => keyenceVisibleInstructions(n, c[side]).map((i) => i.id)),
        ),
        c[side].instructions.map((i) => i.id),
      );
  }
  const native = parse([
    'AREA_ST',
    ';DummyNative := 9;',
    'LD MR850',
    'BOX_ST',
    ';DummyBox := 11;',
    'END',
  ]);
  assert.equal(keyenceScriptRegions(native).length, 0);
  assert.equal(
    keyenceScriptNetworks(native).some((n) => n.script),
    false,
  );
  assert.equal(
    keyenceScriptNetworks(native)
      .flatMap((n) => n.instructions)
      .filter((i) => i.st).length,
    2,
  );
});
