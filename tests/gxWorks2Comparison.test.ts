import test from 'node:test';
import assert from 'node:assert/strict';
import {isComparisonHeader,parseComparison} from '../src/comparison.ts';
import {parseCsvBatch} from '../src/batch.ts';

const tsv=(rows:string[][])=>rows.map(row=>row.map(value=>'"'+value.replaceAll('"','""')+'"').join('\t')).join('\n');
const fixture=(metadata:string[],resultHeader:string,rows:string[][])=>tsv([
 ...metadata.map(value=>[value]),['行','ステップ','照合元','ステップ','照合先',resultHeader],...rows
]);
const bytes=(text:string)=>new TextEncoder().encode(text).buffer;

test('GX Works2 headers and adjacent arrow metadata retain quoted operands and one-sided rows',()=>{
 const p=parseComparison(fixture([
  '照合元: before "quoted"','    -> C:\\synthetic\\SRC_UNIT',
  '照合先：after','    -> synthetic/TGT_UNIT'
 ],'比較結果',[
  ['1','0','LD X31','0','LD X31','一致'],
  ['2','1','$MOV "AA BB" D901','1','$MOV "CC DD" D901','不一致'],
  ['3','','','5','INC D901','追加'],
  ['4','5','LD X32','6','LD X32','一致'],
  ['5','6','OUT Y32','7','OUT Y32','一致']
 ]),'ordinary-input.csv');
 const comparison=p.comparison!;
 assert.equal(p.name,'ordinary-input.csv');
 assert.equal(comparison.sourceProject,'before "quoted"');assert.equal(comparison.targetProject,'after');
 assert.equal(comparison.sourceName,'SRC_UNIT');assert.equal(comparison.targetName,'TGT_UNIT');
 assert.deepEqual(p.instructions[1].operands,['"AA BB"','D901']);
 assert.deepEqual(comparison.target.instructions[1].operands,['"CC DD"','D901']);
 assert.ok(!p.instructions.some(instruction=>instruction.op==='INC'));
 assert.equal(comparison.changes.find(change=>change.kind==='added')?.targetText,'INC D901');
 assert.equal(comparison.differentRows,2);
 assert.equal(isComparisonHeader(['行','ステップ','照合元','ステップ','照合先','比較結果']),true);
 assert.equal(isComparisonHeader(['行','ステップ','照合元','ステップ','照合先','照合結果']),true);
 assert.equal(isComparisonHeader(['行','ステップ','照合元','ステップ','照合先','別の列']),false);
});

test('GX Works2 permits an empty source and never searches across another metadata section',()=>{
 const p=parseComparison(fixture([
  '照合元：left-project','別セクション：placeholder','    -> NOT_THE_SOURCE',
  '照合先: right-project','    -> Z:\\synthetic\\TARGET_ONLY'
 ],'比較結果',[
  ['1','','','0','LD X41','追加'],['2','','','1','OUT Y41','追加']
 ]),'single-side.csv');
 assert.equal(p.instructions.length,0);assert.equal(p.comparison!.target.instructions.length,2);
 assert.equal(p.comparison!.sourceProject,'left-project');assert.equal(p.comparison!.targetProject,'right-project');
 assert.equal(p.comparison!.sourceName,'');assert.equal(p.comparison!.targetName,'TARGET_ONLY');
 assert.deepEqual(p.comparison!.changes.map(change=>change.kind),['added','added']);
});

test('GX Works3 metadata takes priority and batch routing uses headers with Works2 CPU metadata',()=>{
 const rows=[['1','0','LD X61','0','LD X61','一致'],['2','1','OUT Y61','1','OUT Y61','一致']];
 const works3=fixture([
  '照合元：fallback-left','    -> WRONG_LEFT','照合先: fallback-right','    -> WRONG_RIGHT',
  '照合元プロジェクト: preferred-left','照合先プロジェクト：preferred-right',
  '照合元データ名：MAIN_LEFT','照合先データ名: MAIN_RIGHT'
 ],'照合結果',rows);
 const p=parseComparison(works3,'modern.csv');
 assert.equal(p.comparison!.sourceProject,'preferred-left');assert.equal(p.comparison!.targetProject,'preferred-right');
 assert.equal(p.comparison!.sourceName,'MAIN_LEFT');assert.equal(p.comparison!.targetName,'MAIN_RIGHT');
 assert.equal(p.comparison!.differentRows,0);
 const works2=fixture(['照合元: old-left','    -> OLD_LEFT','照合先：old-right','    -> OLD_RIGHT'],'比較結果',rows);
 const normal=tsv([
  ['synthetic'],['PC情報:','QCPU TEST'],['ステップ番号','命令','I/O(デバイス)'],
  ['0','LD','X71'],['1','OUT','Y71']
 ]);
 const result=parseCsvBatch([
  {name:'ordinary-name.csv',bytes:bytes(works2)},
  {name:'also-ordinary.csv',bytes:bytes(works3)},
  {name:'diff-looking-name.csv',bytes:bytes(normal)}
 ]);
 assert.deepEqual(result.errors,[]);assert.equal(result.programs.length,3);assert.deepEqual(result.comments,[]);
 assert.equal(result.programs.find(program=>program.name==='ordinary-name.csv')?.comparison?.sourceName,'OLD_LEFT');
 assert.equal(result.programs.find(program=>program.name==='also-ordinary.csv')?.comparison?.sourceName,'MAIN_LEFT');
 const ordinary=result.programs.find(program=>program.name==='diff-looking-name.csv');
 assert.ok(ordinary);assert.equal(ordinary.comparison,undefined);assert.equal(ordinary.cpu,'QCPU TEST');
});
