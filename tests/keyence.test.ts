import test from 'node:test';
import assert from 'node:assert/strict';
import {programFormat} from '../src/programFormat.ts';
import {parseCsvBatch} from '../src/batch.ts';
import {parseKeyenceMnm} from '../src/keyence/parser.ts';
import {isKeyenceCommentCsv,parseKeyenceComments,keyenceDeviceComment} from '../src/keyence/comments.ts';
const utf8=(text:string)=>new TextEncoder().encode(text).buffer;
const mnm='DEVICE:99\r\n;MODULE:SyntheticModule\r\n;MODULE_TYPE:0\r\n;synthetic comment\r\nLD CR1234\r\nOUT MR20\r\nEND\r\nENDH\r\n';
const csv='ステップ番号\t命令\tI/O(デバイス)\n0\tLD\tX20\n1\tOUT\tY20\n';
test('manufacturer routing is based only on the complete case-insensitive extension',()=>{
 for(const name of ['sample.mnm','folder/SAMPLE.MNM','sample.MnM'])assert.equal(programFormat(name),'keyence');
 assert.equal(programFormat('sample.csv'),'mitsubishi');assert.equal(programFormat('sample.CSV'),'mitsubishi');
 for(const name of ['sample.mnm.csv.bak','sample.mnm.txt','samplemnm'])assert.equal(programFormat(name),undefined);
});
test('MNM uses its own model and preserves device code, module headers, ENDH and raw source',()=>{
 const program=parseKeyenceMnm(utf8(mnm),'synthetic.mnm');
 assert.equal(program.format,'keyence-mnm');assert.equal(program.deviceCode,'99');assert.equal(program.moduleName,'SyntheticModule');
 assert.deepEqual(program.instructions.map(i=>i.opcode),['LD','OUT','END','ENDH']);
 assert.deepEqual(program.instructions[0].operands,['CR1234']);assert.equal(program.instructions[0].sourceLine,5);
 assert.equal(program.text,mnm);assert.equal(program.comments[0].text,'synthetic comment');
 assert.equal('networks' in program,false);assert.equal('cpu' in program,false);
});
test('MNM decoding retains Unicode UTF-16LE BOM data without the GX decoder',()=>{
 const text=mnm.replace('SyntheticModule','架空モジュール');const bytes=Buffer.from('\uFEFF'+text,'utf16le');
 const p=parseKeyenceMnm(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer,'unicode.mnm');
 assert.equal(p.moduleName,'架空モジュール');assert.equal(p.instructions.at(-1)?.opcode,'ENDH');
});
test('mixed batch keeps manufacturer models and Mitsubishi comments separate',()=>{
 const p=parseCsvBatch([
  {name:'kv.mnm',folder:'same',bytes:utf8(mnm)},
  {name:'gx.csv',folder:'same',bytes:utf8(csv)},
  {name:'comment.csv',folder:'same',bytes:utf8('デバイス名\tJapanese/日本語\nCR1234\t三菱用の架空コメント\nY20\t出力')}
 ]);
 assert.deepEqual(p.errors,[]);assert.deepEqual(p.programs.map(i=>i.name),['gx.csv']);assert.deepEqual(p.keyencePrograms.map(i=>i.name),['kv.mnm']);
 assert.equal(p.commentsByProgram['gx.csv'].Y20,'出力');assert.equal(p.commentsByProgram['kv.mnm'],undefined);
 assert.equal('pins' in p.keyencePrograms[0].instructions[0],false);
});
test('a renamed CSV never falls through from MNM to the Mitsubishi parser',()=>{
 const p=parseCsvBatch([{name:'renamed.mnm',bytes:utf8(csv)},{name:'good.csv',bytes:utf8(csv)}]);
 assert.equal(p.keyencePrograms.length,0);assert.equal(p.programs.length,1);assert.match(p.errors[0].message,/キーエンスMNM.*DEVICE/);
});

test('MNM separates inline comments outside quoted strings and preserves raw source',()=>{
 const source='DEVICE:99\n;MODULE:Example\n; First section\n; Second line\nMOV "part;one ""quoted""" DM001; inline comment\nOUT R001 ; output note\n';
 const p=parseKeyenceMnm(utf8(source),'example.mnm');
 assert.deepEqual(p.instructions[0].operands,['"part;one ""quoted"""','DM001']);
 assert.equal(p.instructions[0].comment,'inline comment');
 assert.equal(p.instructions[0].statement,'First section\nSecond line');
 assert.equal(p.instructions[0].sourceLine,5);
 assert.equal(p.instructions[0].raw,'MOV "part;one ""quoted""" DM001; inline comment');
 assert.equal(p.instructions[1].comment,'output note');assert.equal(p.instructions[1].statement,'');
 assert.equal(p.comments.length,2);assert.equal(p.text,source);
 assert.deepEqual(p.deviceComments,{});
});

test('Keyence comment CSV uses comment1 and resolves padded addresses including hexadecimal B and W',()=>{
 const bytes=utf8(',,コメント1,コメント2\nB00A,,架空ビット,other language\nW000F,,架空ワード,\nDM00120,,"架空,データ",\nR000,,架空リレー,\nCR002,,架空制御,\n');
 assert.equal(isKeyenceCommentCsv(bytes),true);
 const comments=parseKeyenceComments(bytes);
 for(const address of ['B0A','B000A','ba'])assert.equal(keyenceDeviceComment(address,comments),'架空ビット');
 assert.equal(keyenceDeviceComment('W0F',comments),'架空ワード');
 assert.equal(keyenceDeviceComment('DM120',comments),'架空,データ');
 assert.equal(keyenceDeviceComment('R0',comments),'架空リレー');
 assert.equal(keyenceDeviceComment('CR0002',comments),'架空制御');
 assert.equal(keyenceDeviceComment('DM121',comments),'');
 assert.equal(isKeyenceCommentCsv(utf8('デバイス名\tJapanese/日本語\nB0A\t他形式')),false);
 assert.throws(()=>parseKeyenceComments(utf8('address,comment\nB0A,text')),/キーエンス/);
});

test('MNM external comments remain independent from inline comments and other programs',()=>{
 const comments=parseKeyenceComments(utf8(',,コメント1,コメント2\nR01,,外部コメント,\n'));
 const a=parseKeyenceMnm(utf8('DEVICE:99\nLD R001; 命令自身のコメント\nOUT R002\n'),'a.mnm',comments);
 const b=parseKeyenceMnm(utf8('DEVICE:99\nLD R001\nOUT R002\n'),'b.mnm');
 assert.equal(a.instructions[0].comment,'命令自身のコメント');
 assert.equal(keyenceDeviceComment('R001',a.deviceComments),'外部コメント');
 assert.equal(keyenceDeviceComment('R002',a.deviceComments),'');
 assert.equal(keyenceDeviceComment('R001',b.deviceComments),'');
 a.deviceComments.R1='changed';assert.equal(comments.R1,'外部コメント');
});

test('batch assigns Keyence comment tables only within their folder before parsing MNM',()=>{
 const table=(comment:string)=>utf8(',,コメント1,コメント2\nCR1234,,'+comment+',\n');
 const p=parseCsvBatch([
  {name:'a/00.mnm',folder:'a',bytes:utf8(mnm)},
  {name:'b/00.mnm',folder:'b',bytes:utf8(mnm)},
  {name:'c/00.mnm',folder:'c',bytes:utf8(mnm)},
  {name:'b/comment.csv',folder:'b',bytes:table('フォルダーB')},
  {name:'a/comment.csv',folder:'a',bytes:table('フォルダーA')},
  {name:'a/gx.csv',folder:'a',bytes:utf8(csv)},
  {name:'a/device.csv',folder:'a',bytes:utf8('デバイス名\tJapanese/日本語\nY20\t三菱の出力')}
 ]);
 assert.deepEqual(p.errors,[]);
 const program=(name:string)=>p.keyencePrograms.find(program=>program.name===name)!;
 assert.equal(keyenceDeviceComment('CR1234',program('a/00.mnm').deviceComments),'フォルダーA');
 assert.equal(keyenceDeviceComment('CR1234',program('b/00.mnm').deviceComments),'フォルダーB');
 assert.equal(keyenceDeviceComment('CR1234',program('c/00.mnm').deviceComments),'');
 assert.equal(p.commentsByProgram['a/gx.csv'].Y20,'三菱の出力');
 assert.equal(p.commentsByProgram['a/gx.csv'].CR1234,undefined);
 assert.equal(p.programs.length,1);assert.equal(p.keyencePrograms.length,3);
});

test('batch honors named comment tables separately for each manufacturer',()=>{
 const p=parseCsvBatch([
  {name:'gx.csv',folder:'same',bytes:utf8(csv)},
  {name:'kv.mnm',folder:'same',bytes:utf8(mnm)},
  {name:'comment.csv',folder:'same',bytes:utf8('デバイス名\tJapanese/日本語\nY20\t採用')},
  {name:'other.csv',folder:'same',bytes:utf8('デバイス名\tJapanese/日本語\nY20\t不採用')},
  {name:'kv-comments.csv',folder:'same',bytes:utf8(',,コメント1,コメント2\nCR1234,,キーエンスのみ,\n')}
 ]);
 assert.deepEqual(p.errors,[]);assert.equal(p.commentsByProgram['gx.csv'].Y20,'採用');
 assert.equal(keyenceDeviceComment('CR1234',p.keyencePrograms[0].deviceComments),'キーエンスのみ');
});

test('batch reports one progress event per file and one error per malformed input',()=>{
 const files=[{name:'bad.mnm',bytes:utf8('not MNM')},{name:'good.mnm',bytes:utf8(mnm)},
  {name:'comment.csv',bytes:utf8(',,コメント1,コメント2\nCR1234,,架空コメント,\n')},
  {name:'ignored.txt',bytes:utf8('unsupported')}];
 const events:{done:number;total:number;name:string}[]=[];
 const p=parseCsvBatch(files,(done,total,name)=>events.push({done,total,name}));
 assert.equal(events.length,files.length);assert.equal(new Set(events.map(event=>event.name)).size,files.length);
 assert.deepEqual(events.map(event=>event.done),[1,2,3,4]);assert.equal(events.every(event=>event.total===4),true);
 assert.deepEqual(p.errors.map(error=>error.name),['bad.mnm','ignored.txt']);
 assert.equal(keyenceDeviceComment('CR1234',p.keyencePrograms[0].deviceComments),'架空コメント');
});

test('malformed Keyence comment body is identified by its header and never routed to GX',()=>{
 const bytes=utf8(',,コメント1,コメント2\nR01,,"unterminated comment\n');
 assert.equal(isKeyenceCommentCsv(bytes),true);
 assert.throws(()=>parseKeyenceComments(bytes),/キーエンスのコメントCSVを読み込めません/);
 const events:string[]=[];
 const p=parseCsvBatch([{name:'comment.csv',bytes},{name:'program.mnm',bytes:utf8(mnm)}],(_done,_total,name)=>events.push(name));
 assert.equal(p.errors.length,1);assert.equal(p.errors[0].name,'comment.csv');
 assert.match(p.errors[0].message,/キーエンスのコメントCSV/);
 assert.equal(p.programs.length,0);assert.equal(p.keyencePrograms.length,1);
 assert.deepEqual(events,['comment.csv','program.mnm']);
});
