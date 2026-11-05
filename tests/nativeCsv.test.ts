import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvBatch } from '../src/batch.ts';
import { decodeNativeCsvFiles, nativeCsvBridge, type NativeCsvBridge } from '../src/nativeCsv.ts';

const program = 'ステップ番号\t命令\tI/O(デバイス)\r\n0\tLD\tX12\r\n1\tOUT\tY12\r\n';
const comments = 'デバイス名\tJapanese/日本語\r\nX12\t試験入力\r\nY12\t試験出力\r\n';
const utf8 = (text: string) => new TextEncoder().encode(text);
function utf16(text: string, littleEndian: boolean): Uint8Array {
  const bytes = new Uint8Array(2 + text.length * 2);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0xfeff, littleEndian);
  for (let i = 0; i < text.length; i++) view.setUint16(2 + i * 2, text.charCodeAt(i), littleEndian);
  return bytes;
}
const encodedFile = (name: string, bytes: Uint8Array) => ({ name, base64: Buffer.from(bytes).toString('base64') });

test('native input never forwards supplemental HTML metadata', () => {
  const supplied = { ...encodedFile('Synthetic.mnm', utf8('DEVICE:99\nLD MR0\nFB Sample DM1\nEND')), referenceHtml: '<title>Ignored</title>' };
  const decoded = decodeNativeCsvFiles([supplied]);
  assert.equal(Object.hasOwn(decoded[0], 'referenceHtml'), false);
  const result = parseCsvBatch(decoded);
  assert.deepEqual(result.errors, []);
  assert.equal(result.keyencePrograms[0].instructions[1].fb?.pins[0].name, '引数1');
});

test('native CSV bridge is optional in Node and ordinary browsers and returns the WebView bridge', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const sent: Parameters<NativeCsvBridge['postMessage']>[0][] = [];
  const bridge: NativeCsvBridge = {
    postMessage: message => { sent.push(message); },
    addEventListener() {},
    removeEventListener() {}
  };
  try {
    Reflect.deleteProperty(globalThis, 'window');
    assert.equal(nativeCsvBridge(), undefined);
    Object.defineProperty(globalThis, 'window', { value: {}, configurable: true });
    assert.equal(nativeCsvBridge(), undefined);
    Object.defineProperty(globalThis, 'window', { value: { chrome: {} }, configurable: true });
    assert.equal(nativeCsvBridge(), undefined);
    Object.defineProperty(globalThis, 'window', { value: { chrome: { webview: bridge } }, configurable: true });
    const detected = nativeCsvBridge();
    assert.equal(detected, bridge);
    detected!.postMessage({ type: 'open-csv', token: 7 });
    detected!.postMessage({ type: 'open-folder', token: 8 });
    assert.deepEqual(sent, [{ type: 'open-csv', token: 7 }, { type: 'open-folder', token: 8 }]);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

for (const [encoding, programBytes, commentBytes] of [
  ['UTF-8 program and UTF-16LE comments', utf8(program), utf16(comments, true)],
  ['UTF-16BE program and UTF-8 comments', utf16(program, false), utf8(comments)]
] as const) test('native CSV preserves bytes and imports comments: ' + encoding, () => {
  const files = decodeNativeCsvFiles([
    encodedFile('架空プログラム.csv', programBytes),
    encodedFile('COMMENT.csv', commentBytes)
  ]);
  assert.ok(files.every(file => file.bytes instanceof ArrayBuffer));
  assert.deepEqual(new Uint8Array(files[0].bytes), programBytes);
  assert.deepEqual(new Uint8Array(files[1].bytes), commentBytes);
  assert.equal(files[0].bytes.byteLength, programBytes.length);
  assert.equal(files[1].bytes.byteLength, commentBytes.length);
  const parsed = parseCsvBatch(files);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.programs.map(item => item.name), ['架空プログラム.csv']);
  assert.deepEqual(parsed.programs[0].instructions.map(item => item.operands), [['X12'], ['Y12']]);
  assert.deepEqual(parsed.comments, ['COMMENT.csv']);
  assert.equal(parsed.commentsByProgram['架空プログラム.csv'].X12, '試験入力');
  assert.equal(parsed.commentsByProgram[parsed.programs[0].name].Y12, '試験出力');
});

test('native CSV rejects malformed or noncanonical Base64 instead of accepting corrupted input', () => {
  for (const base64 of ['%', 'A===', 'AA=', 'Zg', 'Zg===', 'Zg==\n', 'Zh==', 'data:text/csv;base64,YQ==']) {
    assert.throws(() => decodeNativeCsvFiles([{ name: 'invalid.csv', base64 }]), /Base64/, base64);
  }
  assert.throws(() => decodeNativeCsvFiles([
    encodedFile('valid.csv', utf8(program)),
    { name: 'invalid.csv', base64: '%' }
  ]), /invalid\.csv/);
});

test('native CSV retains empty CSV errors without discarding valid files and rejects malformed records', () => {
  const malformed: unknown[] = [
    undefined, [], 'not an array', [null], [{}],
    [{ name: '', base64: 'YQ==' }], [{ name: ' ', base64: 'YQ==' }],
    [{ name: 'wrong-type.csv', base64: 1 }]
  ];
  for (const files of malformed) {
    assert.throws(() => decodeNativeCsvFiles(files as Parameters<typeof decodeNativeCsvFiles>[0]), /ファイル/);
  }
  const files = decodeNativeCsvFiles([
    { name: 'empty.csv', base64: '' },
    encodedFile('program.csv', utf8(program)),
    encodedFile('COMMENT.csv', utf8(comments))
  ]);
  assert.ok(files[0].bytes instanceof ArrayBuffer);
  assert.equal(files[0].bytes.byteLength, 0);
  const parsed = parseCsvBatch(files);
  assert.deepEqual(parsed.programs.map(item => item.name), ['program.csv']);
  assert.deepEqual(parsed.programs[0].instructions.map(item => item.operands), [['X12'], ['Y12']]);
  assert.deepEqual(parsed.comments, ['COMMENT.csv']);
  assert.equal(parsed.commentsByProgram[parsed.programs[0].name].Y12, '試験出力');
  assert.deepEqual(parsed.errors.map(item => item.name), ['empty.csv']);
  assert.match(parsed.errors[0].message, /対応/);
});


test('native folder identity survives decoding without exposing or inferring paths',()=>{
 const files=decodeNativeCsvFiles([
  {...encodedFile('first.csv',utf8(program)),folder:'0'},
  {...encodedFile('second.csv',utf8(program)),folder:'1'}
 ]);
 assert.deepEqual(files.map(file=>file.folder),['0','1']);
 assert.throws(()=>decodeNativeCsvFiles([{name:'bad.csv',base64:'YQ==',folder:3}] as unknown as Parameters<typeof decodeNativeCsvFiles>[0]),/不正/);
});
