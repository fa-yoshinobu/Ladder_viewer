import test from 'node:test';
import assert from 'node:assert/strict';
import { deviceComment, commentLines } from '../src/comments.ts';
test('comments resolve exact devices and indexed base addresses without mixing other devices',()=>{
 const comments={M0:'運転',D100:'設定値','U2\\G896':'通信設定'};
 assert.equal(deviceComment('m0',comments),'運転');
 assert.equal(deviceComment('D100LZ12',comments),'設定値');
 assert.equal(deviceComment('U2Z14\\G896Z11',comments),'通信設定');
 assert.equal(deviceComment('D101',comments),'');assert.equal(deviceComment('constructor',comments),'');
});
test('long and multiline comments fit within two lines and preserve their original value',()=>{
 const text='一二三四五六七八九十 ABCDEFGHIJKLMNOP';
 const lines=commentLines(text,12);
 assert.equal(lines.length,2);assert.ok(lines[1].endsWith('…'));
 assert.deepEqual(commentLines('運転\n停止',12),['運転','停止']);
 assert.deepEqual(commentLines('ABC',12),['ABC']);
});
