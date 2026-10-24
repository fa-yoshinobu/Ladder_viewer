import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvBatch } from '../src/batch.ts';
const encode = (text: string) => new TextEncoder().encode(text).buffer;
const csv = '"program"\n"機種情報:"\t"RCPU R120"\n"ステップ番号"\t"命令"\t"I/O(デバイス)"\n"0"\t"LD"\t"SM400"\n"1"\t"OUT"\t"M0"\n';
test('batch keeps all programs sorted and excludes comment CSV by its columns',()=>{
 const result = parseCsvBatch([
  {name:'10_UT.csv',bytes:encode(csv)},
  {name:'renamed.csv',bytes:encode('"project"\n"デバイス名"\t"Japanese/日本語"\n"M0"\t"運転"')},
  {name:'02_MNET.csv',bytes:encode(csv)}
 ]);
 assert.deepEqual(result.programs.map(p=>p.name),['02_MNET.csv','10_UT.csv']);
 assert.deepEqual(result.comments,['renamed.csv']);assert.equal(result.deviceComments.M0,'運転');assert.deepEqual(result.errors,[]);
 assert.ok(result.programs.every(p=>p.instructions.length===2));
});
test('a bad CSV does not discard other programs and progress includes every CSV',()=>{
 const progress: number[]=[];
 const result=parseCsvBatch([{name:'bad.csv',bytes:encode('broken')},{name:'good.csv',bytes:encode(csv)}],done=>progress.push(done));
 assert.deepEqual(result.programs.map(p=>p.name),['good.csv']);assert.equal(result.errors[0].name,'bad.csv');assert.deepEqual(progress,[1,2]);
});
test('different folders retain distinct program names and independent instructions',()=>{
 const result=parseCsvBatch([{name:'a/main.csv',bytes:encode(csv)},{name:'b/main.csv',bytes:encode(csv.replace('"M0"','"M1"'))}]);
 assert.deepEqual(result.programs.map(p=>p.name),['a/main.csv','b/main.csv']);
 assert.deepEqual(result.programs.map(p=>p.instructions[1].operands),[['M0'],['M1']]);
});
