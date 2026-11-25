import test from 'node:test';
import assert from 'node:assert/strict';
import { parseKeyenceMnm } from '../src/keyence/parser';
import { keyenceScriptNetworks } from '../src/keyence/scriptDisplay';
import { layoutKeyenceNetwork, keyenceViewDrawing } from '../src/keyence/layout';
import {
  requestKeyenceInfo,
  serveKeyenceProgram,
  type LayoutReply,
} from '../src/keyence/viewerLayout';

test('worker reports exact geometry and sends drawings only for the requested viewport', async () => {
  const lines = Array.from({ length: 200 }, (_, i) => `LD R${i}\nOUT MR${i}`);
  lines.push('LD R0\nOR R1\nOUT MR200', 'AREA_ST\n;value := TRUE;', 'END');
  const program = parseKeyenceMnm(
    new TextEncoder().encode('DEVICE:57\n' + lines.join('\n')).buffer,
    'main.mnm',
    { R0: '入力' },
  );
  const document = serveKeyenceProgram(program);
  const receive = () =>
    new Promise<LayoutReply>((resolve) => {
      document.port.addEventListener('message', (e: MessageEvent<LayoutReply>) => resolve(e.data), {
        once: true,
      });
      document.port.start();
    });
  try {
    assert.ok(!('instructions' in document) && !('text' in document));
    let revision = 0;
    for (const mode of ['wrap', 'scroll'] as const)
      for (const showComments of [true, false]) {
        const all = keyenceScriptNetworks(program).map((network) =>
          keyenceViewDrawing(layoutKeyenceNetwork(network, program, showComments), mode),
        );
        const wait = receive();
        document.port.postMessage({
          action: 'configure',
          revision: ++revision,
          expanded: [],
          mode,
          showComments,
          top: 0,
          viewportHeight: 100,
          zoom: 1,
        });
        const setup = await wait;
        assert.deepEqual(
          setup.rows?.map((r) => [r.width, r.height]),
          all.map((d) => [d.width, d.height]),
        );
        assert.ok(setup.drawings!.length > 0 && setup.drawings!.length <= 4);
        const far = receive();
        document.port.postMessage({ action: 'range', revision, indexes: [198, 200, 201] });
        const range = await far;
        assert.deepEqual(
          range.drawings?.map(([i]) => i),
          [198, 200, 201],
        );
        for (const [i, drawing] of range.drawings!) {
          const expected = all[i]!;
          const { instructions, warnings, disabled, script, scriptRange } = expected.network;
          assert.deepEqual(drawing, {
            ...expected,
            network: { instructions, warnings, disabled, script, scriptRange },
          });
        }
      }
    const matches = await requestKeyenceInfo(document, {
      action: 'search',
      query: 'MR199',
      mode: 'exact',
    });
    assert.deepEqual(
      matches.map((i) => i.operands),
      [['MR199']],
    );
    assert.ok(
      (await requestKeyenceInfo(document, { action: 'comments' })).entries.some(
        (e) => e.comment === '入力',
      ),
    );
  } finally {
    document.port.postMessage({ action: 'close' });
    document.port.close();
  }
});

test('a circuit exceeding the layout stack retains its source and leaves later circuits available', async () => {
  const body = [
    'DEVICE:57',
    'LD R0',
    ...Array(12000).fill('AND R1'),
    'OUT MR0',
    'LD R2',
    'OUT MR2',
  ].join('\n');
  const parsed = parseKeyenceMnm(new TextEncoder().encode(body).buffer, 'deep.mnm');
  const doc = serveKeyenceProgram(parsed);
  try {
    const result = new Promise<LayoutReply>((resolve) => {
      doc.port.onmessage = (event: MessageEvent<LayoutReply>) => resolve(event.data);
    });
    doc.port.postMessage({
      action: 'configure',
      revision: 1,
      expanded: [],
      mode: 'wrap',
      showComments: false,
      top: 0,
      viewportHeight: 800,
      zoom: 1,
    });
    const scene = await result;
    assert.equal(scene.error, undefined);
    assert.equal(scene.rows?.length, 2);
    assert.equal(scene.rows[1]?.actions, 'OUT MR2');
    const drawing = scene.drawings![0]![1];
    if (drawing.network.warnings.some((w) => w.includes('配置できません'))) {
      assert.equal(drawing.statementLines[0], 'LD R0');
      assert.equal(drawing.statementLines.at(-1), 'OUT MR0');
    } else assert.ok(drawing.symbols.some((symbol) => symbol.instruction.opcode === 'OUT'));
  } finally {
    doc.port.postMessage({ action: 'close' });
    doc.port.close();
  }
});
