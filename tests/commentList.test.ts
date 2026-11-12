import { requireValue } from '../src/requireValue';
import test from 'node:test';
import assert from 'node:assert/strict';
import Papa from 'papaparse';
import {
  mitsubishiCommentList,
  keyenceCommentList,
  commentListAddress,
  commentListRequest,
  commentListTsv,
} from '../src/commentListData.ts';
import { showInstructionMenu, openCommentList } from '../src/CommentList.tsx';
import { parseKeyenceMnm } from '../src/keyence/parser.ts';
import type { Program } from '../src/model.ts';

// Independently invented addresses and comments, without any supplied PLC project data.
test('Mitsubishi list keeps complete comments, sorts device numbers and includes uncommented devices without constants', () => {
  const program = {
    name: 'dummy.csv',
    instructions: [{ operands: ['D10Z2', 'K4M8', 'X2', 'K19', 'HAB', '"Dummy"', 'ZR9', 'Z0'] }],
  } as Program;
  const comments = { D10: 'Dummy register\nsecond line', X10: 'Dummy output', X2: 'Dummy input' };
  const snapshot = JSON.stringify({ program, comments }),
    list = mitsubishiCommentList(program, comments);
  assert.deepEqual(
    list.entries.map((e) => e.address),
    ['D10', 'M8', 'X2', 'X10', 'Z0', 'ZR9'],
  );
  assert.equal(
    list.entries.find((e) => e.address === 'D10')?.comment,
    'Dummy register\nsecond line',
  );
  assert.equal(list.entries.find((e) => e.address === 'M8')?.comment, '');
  assert.equal(commentListRequest(list, ['D10Z2'])?.selectedAddress, 'D10');
  assert.equal(JSON.stringify({ program, comments }), snapshot);
});

test('KEYENCE list includes table and inline device comments without assigning general instruction notes to an operand', () => {
  const program = parseKeyenceMnm(
    new TextEncoder().encode(
      'DEVICE:57\nLD @MR0002 ; Dummy inline input\nOUT MR10\nLD BFA\nMOV #19 DM8 ; Dummy general command note\nEND',
    ).buffer,
    'dummy.mnm',
    { MR2: 'Dummy table input', MR100: 'Unused dummy device' },
  );
  const snapshot = JSON.stringify(program),
    list = keyenceCommentList(program);
  assert.deepEqual(
    list.entries.filter((e) => e.address === 'MR2').map((e) => e.comment),
    ['Dummy table input', 'Dummy inline input'],
  );
  assert.ok(list.entries.some((e) => e.address === 'MR100'));
  assert.ok(list.entries.some((e) => e.address === 'MR10' && e.comment === ''));
  assert.ok(list.entries.some((e) => e.address === 'BFA'));
  assert.ok(
    !list.entries.some((e) => e.comment.includes('general command note') || e.address === '#19'),
  );
  assert.equal(commentListRequest(list, ['@MR0002'])?.selectedAddress, 'MR2');
  assert.equal(JSON.stringify(program), snapshot);
  assert.equal(commentListAddress('DM0008', 'keyence'), 'DM8');
});

test('copied blocks round-trip as exactly two spreadsheet columns including tabs, quotes and multiline comments', () => {
  const rows = [
    { address: 'M81', comment: 'Dummy "quoted" comment' },
    { address: 'M82', comment: 'Dummy\tcolumn\nsecond line' },
    { address: 'M83', comment: '' },
  ];
  const copied = commentListTsv(rows);
  assert.deepEqual(
    Papa.parse<string[]>(copied, { delimiter: '\t' }).data,
    rows.map((row) => [row.address, row.comment]),
  );
  assert.ok(!copied.startsWith('アドレス'));
});

test('hexadecimal device addresses remain in address order around the selected row', () => {
  const program = { name: 'dummy.csv', instructions: [] } as unknown as Program;
  assert.deepEqual(
    mitsubishiCommentList(program, { X10: 'Dummy 16', XA: 'Dummy 10', X2: 'Dummy 2' }).entries.map(
      (e) => e.address,
    ),
    ['X2', 'XA', 'X10'],
  );
  const keyence = parseKeyenceMnm(
    new TextEncoder().encode('DEVICE:57\nLD B10\nOUT B0A').buffer,
    'dummy.mnm',
    { BA: 'Dummy 10', B2: 'Dummy 2' },
  );
  assert.deepEqual(
    keyenceCommentList(keyence).entries.map((e) => e.address),
    ['B2', 'BA', 'B10'],
  );
});

test('native context menu and list opening carry the chosen device and its own comparison side', () => {
  const messages: unknown[] = [],
    previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { chrome: { webview: { postMessage: (message: unknown) => messages.push(message) } } },
  });
  try {
    const scope = {
      title: '比較先 · dummy.mnm',
      manufacturer: 'keyence' as const,
      entries: [{ address: 'MR92', comment: 'Dummy target only' }],
    };
    const request = commentListRequest(scope, ['@MR00092'], true)!;
    showInstructionMenu({} as MouseEvent, 'Original instruction copy', request);
    openCommentList(request);
    assert.deepEqual(messages, [
      { type: 'instruction-menu', text: 'Original instruction copy', commentList: request },
      { type: 'show-comment-list', commentList: request },
    ]);
    assert.equal(request.selectedAddress, 'MR92');
    assert.equal(requireValue(request.entries[0]).comment, 'Dummy target only');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
