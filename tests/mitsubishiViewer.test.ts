import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProgram } from '../src/model';
import {
  serveMitsubishiProgram,
  storedNetworkSize,
  type MitsubishiPaint,
} from '../src/mitsubishiViewer';
import { gridLayout, restoreViewerGrid, ROW, COMMENT_ROW } from '../src/layout';
import { describeNetworkSize } from '../src/networkDimensions';
import { instructionDrawingOffset } from '../src/NetworkDrawing';

test('Mitsubishi worker keeps offscreen logic local and returns exact geometry for a distant search hit', async () => {
  const commands = [
    ...Array.from({ length: 100 }, (_, i) => ['LD M' + i, 'OUT Y' + i]).flat(),
    'LD M100',
    ...Array.from({ length: 50 }, (_, i) => 'AND M' + (1000 + i)),
    'OUT Y100',
  ];
  const text =
    'ステップ番号\t命令\tI/O(デバイス)\n' +
    commands.map((line, i) => [i, ...line.split(' ')].join('\t')).join('\n');
  const program = parseProgram(text, 'remote.csv');
  const doc = serveMitsubishiProgram(program, true, {
    height: 480,
    zoom: 1,
    comments: true,
    mode: 'wrap',
  });
  try {
    assert.ok(doc.initial.length > 0 && doc.initial.length < 30);
    const index = program.networks.length - 1,
      circuit = program.networks[index]!;
    assert.equal('condition' in doc.networks[index]!.actions[0]!, false);
    const next = new Promise<MitsubishiPaint>((resolve, reject) => {
      doc.port.onmessage = ({ data }) =>
        data.error ? reject(new Error(data.error)) : resolve(data.drawings[0]);
    });
    doc.port.postMessage({ action: 'range', request: 1, indices: [index] });
    const { network, grid } = await next;
    assert.equal(network.actions[0]!.condition, null);
    restoreViewerGrid(network, grid);
    assert.deepEqual(gridLayout(network), gridLayout(circuit));
    const target = circuit.instructions.at(-2)!.id;
    for (const height of [ROW, COMMENT_ROW])
      for (const mode of ['scroll', 'wrap'] as const) {
        assert.deepEqual(
          storedNetworkSize(doc, index, height, mode),
          describeNetworkSize(circuit, height, mode),
        );
        assert.equal(
          instructionDrawingOffset(network, target, height, 0.75, mode),
          instructionDrawingOffset(circuit, target, height, 0.75, mode),
        );
      }
  } finally {
    doc.port.postMessage({ action: 'close' });
    doc.port.close();
  }
});
