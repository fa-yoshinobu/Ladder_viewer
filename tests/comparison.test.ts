import test from 'node:test';
import assert from 'node:assert/strict';
import {parseComparison,pairNetworks} from '../src/comparison.ts';
import {parseCsvBatch} from '../src/batch.ts';
import {instructionKey} from '../src/model.ts';
const fixture=(rows:string[][])=>[
 ['照合元プロジェクト：before'],['照合元データ名：MAIN'],['照合先プロジェクト：after'],['照合先データ名：MAIN'],
 ['行','ステップ','照合元','ステップ','照合先','照合結果'],...rows
].map(row=>row.map(value=>'"'+value.replaceAll('"','""')+'"').join('\t')).join('\n');

test('comparison retains metadata, original CSV rows, quoted operands and statements',()=>{
 const p=parseComparison(fixture([
  ['1','0',';初期設定','0',';初期設定','一致'],['2','0','P100','0','P100','一致'],
  ['3','0','LD SM400','0','LD SM400','一致'],['4','1','$MOV "A B" D100Z0','1','$MOV "A B" D100Z0','一致']
 ]),'001.csv');
 const c=p.comparison!;
 assert.equal(c.sourceProject,'before');assert.equal(c.targetProject,'after');assert.equal(c.sourceName,'MAIN');assert.equal(c.differentRows,0);assert.equal(c.rowCount,4);
 assert.deepEqual(p.instructions.map(instructionKey),c.target.instructions.map(instructionKey));
 assert.deepEqual(p.instructions.at(-1)!.operands,['"A B"','D100Z0']);
 assert.equal(p.instructions[0].sourceRow,7);assert.notEqual(p.instructions[0].id,c.target.instructions[0].id);
 assert.equal(p.networks[0].title,'初期設定');assert.equal(p.networks[0].pointer?.op,'P100');
 assert.equal(pairNetworks(p.networks,c.target.networks).length,1);
});

test('one-sided rows stay on their own side and later matching circuits realign',()=>{
 const p=parseComparison(fixture([
  ['1','0','LD X0','0','LD X0','一致'],['2','1','OUT Y0','1','OUT Y1','不一致'],
  ['3','','','2','LD X1','追加'],['4','','','3','OUT Y2','追加'],
  ['5','2','LD X2','4','LD X2','不一致'],['6','3','OUT Y3','5','OUT Y3','不一致']
 ]),'change.csv');
 assert.equal(p.instructions.length,4);assert.equal(p.comparison!.target.instructions.length,6);assert.equal(p.comparison!.differentRows,5);
 const pairs=pairNetworks(p.networks,p.comparison!.target.networks);
 assert.deepEqual(pairs.map(pair=>[pair.source.length,pair.target.length]),[[1,1],[0,1],[1,1]]);
 assert.equal(pairs[2].source[0].instructions[0].sourceRow,pairs[2].target[0].instructions[0].sourceRow);
});

test('batch accepts comparison and normal formats together; float comparisons remain contacts',()=>{
 const text=fixture([['1','0','LDE> D0 E0','0','LDE> D0 E0','一致'],['2','3','ANDE<= D2 E1','3','ANDE<= D2 E1','一致'],['3','6','OUT M0','6','OUT M0','一致']]);
 const bytes=(text:string)=>new TextEncoder().encode(text).buffer;
 const result=parseCsvBatch([{name:'comparison.csv',bytes:bytes(text)},{name:'normal.csv',bytes:bytes('"ステップ番号"\t"命令"\t"I/O(デバイス)"\n"0"\t"OUT"\t"M0"')}]);
 assert.deepEqual(result.errors,[]);assert.equal(result.programs.length,2);
 const p=result.programs[0];assert.ok(p.comparison);assert.equal(p.networks[0].actions.length,1);
 assert.deepEqual(p.networks[0].warnings,[]);assert.equal(p.networks[0].actions[0].condition?.kind,'and');
});

test('malformed comparison data fails visibly and an empty side is allowed',()=>{
 assert.throws(()=>parseComparison(fixture([['1','0','LD X0']]),'broken'),/列数/);
 const p=parseComparison(fixture([['1','','','0','OUT M0','追加']]),'new');
 assert.equal(p.networks.length,0);assert.equal(p.comparison!.target.networks.length,1);
 assert.throws(()=>parseComparison(fixture([['1','','','','','一致']]),'empty'),/命令がありません/);
});
test('statements inside a shared branch and edge markers do not split the condition stack',()=>{
 const commands=['LD X0','OUT Y0',';分岐','MPS','AND X1','OUT Y1','MPP','LD X2','MEP','ORB','OUT Y2'];
 const p=parseComparison(fixture(commands.map((op,index)=>[String(index+1),String(index),op,String(index),op,'一致'])),'branch');
 assert.deepEqual(p.networks.flatMap(n=>n.warnings),[]);assert.equal(p.networks.length,1);
 assert.deepEqual(p.networks[0].actions.map(a=>a.instruction.operands[0]),['Y0','Y1','Y2']);
 assert.equal(p.instructions.find(i=>i.op==='MPS')?.statement,'分岐');
});
test('differences classify changed operands, added/deleted rows and step-only shifts separately',()=>{
 const p=parseComparison(fixture([
  ['1','0','LD X0','0','LD X0','一致'],['2','1','OUT Y0','1','OUT Y1','不一致'],
  ['3','2','LD X1','','','削除'],['4','3','OUT Y2','','','削除'],
  ['5','','','2','LD X3','追加'],['6','','','3','SET M0','追加'],
  ['7','4','LD X4','6','LD X4','不一致'],['8','5','OUT Y4','7','OUT Y4','不一致']
 ]),'diff');
 assert.deepEqual(p.comparison!.changes.map(c=>c.kind),['changed','removed','removed','added','added','step','step']);
 assert.equal(p.instructions[0].difference,undefined);
 assert.deepEqual(p.instructions[1].difference,{kind:'changed',opChanged:false,operandChanges:[0],otherText:'OUT Y1',otherStep:'1'});
 assert.equal(p.comparison!.target.instructions[1].difference?.otherText,'OUT Y0');
 assert.equal(p.instructions[2].difference?.kind,'removed');
 assert.equal(p.comparison!.target.instructions[2].difference?.kind,'added');
 assert.deepEqual(p.instructions.at(-1)!.difference?.operandChanges,[]);
 assert.equal(p.instructions.at(-1)!.difference?.kind,'step');
});

test('opcode, quoted operand and control/statement differences retain both originals',()=>{
 const p=parseComparison(fixture([
  ['1','0',';元の説明','0',';先の説明','不一致'],['2','0','LD X0','0','LDI X0','不一致'],
  ['3','1','MPS','1','MPS','一致'],['4','2','$MOV "A B" D0','2','$MOV "A C" D0','不一致'],
  ['5','8','MPP','8','MRD','不一致'],['6','9','OUT M0','9','OUT M0','一致'],['7','10',';末尾・元','10',';末尾・先','不一致']
 ]),'detail');
 assert.equal(p.comparison!.changes.length,5);
 assert.equal(p.instructions[0].difference?.opChanged,true);
 assert.deepEqual(p.instructions[0].difference?.operandChanges,[]);
 assert.deepEqual(p.instructions[2].difference?.operandChanges,[0]);
 assert.equal(p.comparison!.changes[0].sourceText,';元の説明');
 assert.equal(p.comparison!.changes.at(-1)!.targetText,';末尾・先');
 assert.equal(p.instructions[3].difference?.otherText,'MRD');
});