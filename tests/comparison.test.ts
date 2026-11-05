import test from 'node:test';
import assert from 'node:assert/strict';
import {comparisonComment,parseComparison,pairNetworks} from '../src/comparison.ts';
import {parseCsvBatch} from '../src/batch.ts';
import {instructionKey,symbolDifferenceKind} from '../src/model.ts';
import {gridLayout} from '../src/layout.ts';
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
 assert.equal(p.instructions.length,4);assert.equal(p.comparison!.target.instructions.length,6);assert.equal(p.comparison!.differentRows,3);assert.equal(p.comparison!.shiftedSteps,2);
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
 assert.deepEqual(p.comparison!.changes.map(c=>c.kind),['changed','changed','added','removed']);
 assert.equal(p.instructions[0].difference,undefined);
 assert.deepEqual(p.instructions[1].difference,{kind:'changed',opChanged:false,operandChanges:[0],otherText:'OUT Y1',otherStep:'1'});
 assert.equal(p.comparison!.target.instructions[1].difference?.otherText,'OUT Y0');
 assert.equal(p.instructions[2].difference?.kind,'changed');
 assert.equal(p.comparison!.target.instructions[2].difference?.kind,'changed');
 assert.equal(p.instructions.at(-1)!.difference,undefined);
 assert.equal(p.comparison!.shiftedSteps,2);
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
const independent=(source:string[],target:string[])=>fixture(Array.from({length:Math.max(source.length,target.length)},(_,i)=>[String(i+1),source[i]?String(i):'',source[i]??'',target[i]?String(i):'',target[i]??'','不一致']));

test('a retained contact changing from AND to LD is paired before a removed leading contact',()=>{
 const original=['LDI M6','ANI X100','AND X10F','OUT Y0'],reduced=['LDI X100','AND X10F','OUT Y0'];
 for(const reverse of [false,true]){
  const p=parseComparison(independent(reverse?reduced:original,reverse?original:reduced),'contact-role.csv');
  const a=p.instructions.find(i=>i.operands[0]==='X100')!,b=p.comparison!.target.instructions.find(i=>i.operands[0]==='X100')!;
  assert.equal(a.comparisonRow,b.comparisonRow);
  assert.equal(symbolDifferenceKind(a),undefined);assert.equal(symbolDifferenceKind(b),undefined);
  const extra=(reverse?p.comparison!.target:p).instructions.find(i=>i.operands[0]==='M6')!;
  assert.equal(extra.difference?.kind,reverse?'added':'removed');
  assert.equal(p.comparison!.changes.length,2);
  assert.ok(p.comparison!.changes.every(c=>c.kind!=='changed'||c.sourceText.endsWith('X100')&&c.targetText.endsWith('X100')));
 }
});

test('an inserted condition does not pair with an output whose operand also changed',()=>{
 const p=parseComparison(independent(['LD X0','OUT Y0','LD X2','OUT Y2'],['LD X0','AND X1','OUT Y1','LD X2','OUT Y2']),'synthetic-condition-insert.csv');
 assert.deepEqual(p.comparison!.changes.map(c=>[c.kind,c.sourceText,c.targetText]),[
  ['added','','AND X1'],['changed','OUT Y0','OUT Y1']
 ]);
 assert.equal(p.instructions[1].difference?.otherText,'OUT Y1');
 assert.ok(p.instructions.slice(2).every(i=>!i.difference));
 assert.ok(p.comparison!.target.instructions.slice(3).every(i=>!i.difference));
});

test('unrelated output and condition changes stay separate while similar outputs pair',()=>{
 const p=parseComparison(independent(['LD X0','OUT Y0'],['LD X0','AND X1','SET M9']),'synthetic-unrelated.csv');
 assert.ok(p.comparison!.changes.some(c=>c.kind==='removed'&&c.sourceText==='OUT Y0'));
 assert.ok(p.comparison!.changes.some(c=>c.kind==='added'&&c.targetText==='AND X1'));
 assert.ok(p.comparison!.changes.some(c=>c.kind==='added'&&c.targetText==='SET M9'));
 assert.ok(!p.comparison!.changes.some(c=>c.kind==='changed'&&c.sourceText==='OUT Y0'));
 const changed=parseComparison(independent(['LD X0','OUT Y0'],['LD X0','SET Y0']),'synthetic-coil-change.csv');
 assert.deepEqual(changed.comparison!.changes.map(c=>[c.kind,c.sourceText,c.targetText]),[['changed','OUT Y0','SET Y0']]);
});

test('statement and instruction additions are not paired as a modification',()=>{
 const p=parseComparison(independent([';元の見出し','LD X0','OUT Y0'],['LD X0','AND X1','OUT Y0']),'synthetic-statement.csv');
 assert.ok(p.comparison!.changes.some(c=>c.kind==='removed'&&c.sourceText===';元の見出し'));
 assert.ok(p.comparison!.changes.some(c=>c.kind==='added'&&c.targetText==='AND X1'));
 assert.ok(!p.comparison!.changes.some(c=>c.kind==='changed'));
});

test('an inserted circuit does not turn subsequent matching commands into changes',()=>{
 const p=parseComparison(independent(['LD X0','OUT Y0','LD X1','OUT Y1'],['LD X0','OUT Y0','LD X9','OUT Y9','LD X1','OUT Y1']),'insert');
 const c=p.comparison!;
 assert.deepEqual(c.changes.map(change=>change.kind),['added','added']);
 assert.equal(c.shiftedSteps,2);
 assert.ok(p.instructions.every(i=>!i.difference));
 assert.ok(c.target.instructions.slice(4).every(i=>!i.difference));
 assert.notEqual(p.instructions[2].sourceRow,c.target.instructions[4].sourceRow);
 assert.equal(p.instructions[2].comparisonRow,c.target.instructions[4].comparisonRow);
 assert.deepEqual(pairNetworks(p.networks,c.target.networks).map(pair=>[pair.source.length,pair.target.length]),[[1,1],[0,1],[1,1]]);
});

test('deletion preserves both source locations and does not cascade differences',()=>{
 const p=parseComparison(independent(['LD X0','OUT Y0','LD X9','OUT Y9','LD X1','OUT Y1'],['LD X0','OUT Y0','LD X1','OUT Y1']),'delete');
 assert.deepEqual(p.comparison!.changes.map(change=>change.kind),['removed','removed']);
 assert.equal(p.comparison!.shiftedSteps,2);
 assert.equal(p.instructions[4].comparisonRow,p.comparison!.target.instructions[2].comparisonRow);
 assert.ok(p.comparison!.target.instructions.every(i=>!i.difference));
});

test('an inserted branch reserves a blank drawing row before the next matching output',()=>{
 const a=['LD X0','MPS','AND X1','OUT Y1','MPP','AND X2','OUT Y2'];
 const b=['LD X0','MPS','AND X1','OUT Y1','MRD','AND X9','OUT Y9','MPP','AND X2','OUT Y2'];
 const p=parseComparison(independent(a,b),'branch-insert');
 assert.deepEqual(p.networks.flatMap(n=>n.warnings),[]);
 assert.deepEqual(p.comparison!.target.networks.flatMap(n=>n.warnings),[]);
 const left=gridLayout(p.networks[0]),right=gridLayout(p.comparison!.target.networks[0]);
 const row=(grid:ReturnType<typeof gridLayout>,operand:string)=>grid.symbols.find(s=>s.instruction.op==='OUT'&&s.instruction.operands[0]===operand)!.row;
 assert.equal(row(left,'Y1'),row(right,'Y1'));
 assert.equal(row(left,'Y2'),row(right,'Y2'));
 assert.ok(row(left,'Y2')>row(left,'Y1')+1);
 assert.ok(!left.symbols.some(s=>s.row===row(right,'Y9')));
});

test('repeated rungs, quoted strings and shifted steps keep their command identity',()=>{
 const a=['LD X0','$MOV "A B" D0','LD X0','$MOV "A B" D0','LD X0','OUT M0'];
 const b=['LD X0','$MOV "A B" D0','LD X9','OUT M9','LD X0','$MOV "A B" D0','LD X0','OUT M0'];
 const p=parseComparison(independent(a,b),'repeat');
 assert.deepEqual(p.comparison!.changes.map(c=>c.kind),['added','added']);
 assert.ok(p.instructions.every(i=>!i.difference));
 assert.deepEqual(p.instructions.map(instructionKey),p.comparison!.target.instructions.filter(i=>!i.difference).map(instructionKey));
});

test('a whole rung inserted among identical contact prefixes stays one added circuit',()=>{
 const rung=['LD X701','AND X702','OUT Y701'];
 const original=[...Array.from({length:4},()=>rung).flat(),'END'];
 for(const position of [0,2,4]){
  const expanded=[...original.slice(0,position*3),'LD X701','AND X702','OUT Y799',...original.slice(position*3)];
  for(const reverse of [false,true]){
   const p=parseComparison(independent(reverse?expanded:original,reverse?original:expanded),'synthetic-repeated-prefix.csv');
   const unchanged=reverse?p.comparison!.target:p,extended=reverse?p:p.comparison!.target;
   const kind=reverse?'removed':'added';
   assert.ok(unchanged.instructions.every(instruction=>!instruction.difference));
   assert.deepEqual(p.comparison!.changes.map(change=>change.kind),[kind,kind,kind]);
   assert.deepEqual(extended.networks[position].instructions.map(instruction=>instruction.difference?.kind),[kind,kind,kind]);
   for(const network of unchanged.networks){
    assert.deepEqual(network.connectionDifferences?.wires,[]);
    assert.deepEqual(network.connectionDifferences?.inputs,[]);
    assert.deepEqual(network.connectionDifferences?.outputs,[]);
   }
   assert.deepEqual(pairNetworks(p.networks,p.comparison!.target.networks).map(group=>[group.source.length,group.target.length]),
    Array.from({length:6},(_,index)=>index===position?(reverse?[1,0]:[0,1]):[1,1]));
  }
 }
});
test('added and removed instructions keep their block status without inline token changes',()=>{
 const common=['LD X0','OUT Y0'];
 const extra=[...common,'LD X9','OUT T1 K2'];
 for(const [source,target,side,kind] of [
  [common,extra,'target','added'],[extra,common,'source','removed']
 ] as const){
  const p=parseComparison(independent([...source],[...target]),kind);
  const instructions=side==='source'?p.instructions:p.comparison!.target.instructions;
  const oneSided=instructions.filter(i=>i.difference?.kind===kind);
  assert.equal(oneSided.length,2);
  assert.deepEqual(p.comparison!.changes.map(c=>c.kind),[kind,kind]);
  for(const i of oneSided){assert.equal(i.difference!.opChanged,false);assert.deepEqual(i.difference!.operandChanges,[]);}
 }
 const changed=parseComparison(independent(['LD X0','OUT T1 K2'],['LD X0','OUT T1 K3']),'changed');
 for(const program of [changed,changed.comparison!.target]){
  const difference=program.instructions[1].difference!;
  assert.equal(difference.kind,'changed');assert.equal(difference.opChanged,false);assert.deepEqual(difference.operandChanges,[1]);
 }
});

test('GX Works2 comparison lines: plain statements and indented notes are not read as instructions',()=>{
 const legacy=(rows:string[][])=>[['照合元：before'],['    -> MAIN'],['照合先：after'],['    -> MAIN'],['行','ステップ','照合元','ステップ','照合先','比較結果'],...rows]
  .map(row=>row.map(value=>'"'+value+'"').join('\t')).join('\n');
 const p=parseComparison(legacy([
  ['1','0','初期化','0','初期化','一致'],['2','7','LD X0','7','LD X0','一致'],['3','8','OUT Y0','8','OUT Y0','一致'],['4','9','  *周辺メモ','9','  *周辺メモ','一致'],
  ['5','10','*[Title]見出し','10','*[Title]見出し','一致'],['6','11','LD X1','11','LD X1','一致'],['7','12','OUT Y1','12','OUT Y1','一致'],['8','13','   <埋込メモ>','13','   <埋込メモ>','一致'],['9','14','END','14','END','一致']
 ]),'legacy.csv');
 assert.deepEqual(p.instructions.map(i=>i.op),['LD','OUT','LD','OUT','END']);
 assert.deepEqual(p.networks.map(n=>n.title),['初期化','[Title]見出し','']);
 assert.equal(p.instructions[1].note,'周辺メモ');assert.equal(p.instructions[3].note,'埋込メモ');
 assert.equal(p.comparison!.target.instructions[3].note,'埋込メモ');
});

test('comparison comment lines: GX Works3 statements keep their text and project-only markers are removed',()=>{
 assert.deepEqual(comparisonComment(';初期設定',false),{kind:'statement',text:'初期設定'});
 assert.deepEqual(comparisonComment(';*',false),{kind:'statement',text:''});
 assert.equal(comparisonComment('LD X0',false),null);
 assert.equal(comparisonComment('初期設定',false),null,'plain text is a statement only in the GX Works2 layout');
 assert.equal(comparisonComment('MOV K1 D0',true),null);
});

test('GX Works2 lowercase and mixed-case headings do not consume uppercase commands or pointers',()=>{
 for(const text of ['p77','Auto start','ready123'])assert.deepEqual(comparisonComment(text,true),{kind:'statement',text});
 for(const text of ['P77','#P77','GLP0','I3','LD X0','LD>= D0 K1','$MOV "Auto start" D0','END','FBRET','FUTURECMD K7']){
  assert.equal(comparisonComment(text,true),null,text);
 }
 assert.equal(comparisonComment('p77',false),null,'Works3 still requires its statement prefix');
});
