import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { decodePlcText } from '../src/textEncoding';
import { decodeCsv } from '../src/model';
import { decodeKeyenceText } from '../src/keyence/encoding';
import { detectCommentFormat } from '../src/commentFormat';
import { isKeyenceCommentCsv } from '../src/keyence/comments';
import { parseCsvBatch } from '../src/batch';

const fixtures: { name: string; base64: string; text: string | null; format: string | null }[] =
  JSON.parse(readFileSync(new URL('./fixtures/comment-formats.json', import.meta.url), 'utf8'));
for (const fixture of fixtures) {
  test('shared comment format: ' + fixture.name, () => {
    const bytes = Uint8Array.from(Buffer.from(fixture.base64, 'base64')).buffer;
    assert.equal(decodeCsv, decodeKeyenceText);
    if (fixture.text === null) {
      assert.throws(() => decodePlcText(bytes));
      return;
    }
    assert.equal(decodePlcText(bytes), fixture.text);
    assert.equal(detectCommentFormat(decodePlcText(bytes)) ?? null, fixture.format);
    assert.equal(isKeyenceCommentCsv(bytes), fixture.format === 'keyence');
    if (fixture.format && fixture.name !== 'malformed-body') {
      const batch = parseCsvBatch([{ name: 'synthetic.csv', bytes }]);
      assert.deepEqual(batch.errors, []);
      assert.deepEqual(batch.comments, ['synthetic.csv']);
    }
  });
}
