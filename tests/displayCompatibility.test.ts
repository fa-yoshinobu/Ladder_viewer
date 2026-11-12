import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProgram } from '../src/model.ts';
import { displayGrid, networkSize } from '../src/layout.ts';
import { parseKeyenceMnm } from '../src/keyence/parser.ts';
import { buildKeyenceNetworks } from '../src/keyence/logic.ts';
import { layoutKeyenceNetwork, keyenceViewDrawing } from '../src/keyence/layout.ts';
import { CELL, COLUMNS, LEFT_GUTTER, LADDER_WIDTH, ROW, BASELINE } from '../src/ladderMetrics.ts';
import { SelectionRect } from '../src/LadderPrimitives.tsx';
import { continuationText } from '../src/continuation.ts';

test('ordinary Mitsubishi and Keyence diagrams share the same 100 percent dimensions and glyph coordinates', () => {
  const csv = 'ステップ番号\t命令\tI/O(デバイス)\n0\tLD\tX0\n1\tANI\tX1\n2\tOUT\tY0';
  const mitsubishi = parseProgram(csv, 'synthetic.csv'),
    grid = displayGrid(mitsubishi.networks[0], 'scroll');
  const keyence = parseKeyenceMnm(
    new TextEncoder().encode('DEVICE:99\nLD R0\nANB R1\nOUT MR0').buffer,
    'synthetic.mnm',
  );
  const drawing = keyenceViewDrawing(
    layoutKeyenceNetwork(buildKeyenceNetworks(keyence)[0], keyence),
    'scroll',
  );
  assert.equal(CELL, 74);
  assert.equal(COLUMNS, 12);
  assert.equal(LADDER_WIDTH, 986);
  assert.equal(networkSize(mitsubishi.networks[0], ROW, 'scroll').width, drawing.width);
  assert.equal(drawing.width, LADDER_WIDTH);
  assert.equal(drawing.rowHeight, ROW);
  assert.equal(drawing.baseline, BASELINE);
  assert.deepEqual(
    grid.symbols.map((s) => [LEFT_GUTTER + s.col * CELL, s.row * ROW + BASELINE, s.span * CELL]),
    drawing.symbols.map((s) => [s.x, s.y, s.width]),
  );
});
test('selection frame is inset from electrical boundaries while the transparent hit area keeps its original bounds', () => {
  const vnode = SelectionRect({
    phase: 'frame',
    x: 1,
    y: 4,
    width: CELL - 2,
    height: ROW - 8,
    selected: true,
  });
  const [hit, frame] = (vnode.props as { children: any[] }).children;
  assert.equal(hit.props.x, 1);
  assert.equal(hit.props.width, CELL - 2);
  assert.ok(frame.props.x > hit.props.x);
  assert.ok(frame.props.x + frame.props.width < hit.props.x + hit.props.width);
  assert.equal(frame.props['pointer-events'], 'none');
});
test('both renderers use the same wrap continuation wording', () => {
  assert.equal(continuationText(0, 2), '1 / 2 段　→ 次段へ接続');
  assert.equal(continuationText(1, 2), '2 / 2 段　（前段からの続き）');
});
