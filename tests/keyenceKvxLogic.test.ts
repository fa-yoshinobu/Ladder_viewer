import test from 'node:test';
import assert from 'node:assert/strict';
import {parseKeyenceMnm} from '../src/keyence/parser.ts';
import {buildKeyenceNetworks,type KeyenceExpression} from '../src/keyence/logic.ts';

// Independent dummy circuits; no file or fixture from the supplied samples is loaded.
const program=(lines:string[])=>parseKeyenceMnm(new TextEncoder().encode(['DEVICE:60',...lines].join('\n')).buffer,'dummy-kvx-logic.mnm');
function condition(value:KeyenceExpression|null):string {
 if(!value)return 'TRUE';
 if(value.kind==='contact')return value.instruction.fb?value.instruction.opcode+':'+value.instruction.fb.name:(value.negated?'!':'')+value.instruction.operands[0];
 if(value.kind==='unary')return value.operation+'('+condition(value.input)+')';
 return '('+condition(value.left)+(value.kind==='and'?' & ':' | ')+condition(value.right)+')';
}

test('FUNLD starts a fresh function chain and keeps its result ahead of the following FUN',()=>{
 const p=program(['LD R9820','OUT MR9821','FUNLD DegToRad dummyRadians dummyDegrees',
  'FUN SIN dummySine dummyRadians','FUN COS dummyCosine dummyRadians','LD R9822','OUT MR9823']);
 const before=structuredClone(p),networks=buildKeyenceNetworks(p);
 assert.deepEqual(networks.map(n=>n.instructions.map(i=>i.opcode)),[['LD','OUT'],['FUNLD','FUN','FUN'],['LD','OUT']]);
 assert.deepEqual(networks[1].actions.map(a=>a.instruction.fb?.name),['SIN','COS']);
 assert.deepEqual(networks[1].actions.map(a=>condition(a.condition)),['FUNLD:DegToRad','FUNLD:DegToRad']);
 assert.equal(networks[1].actions[0].condition,networks[1].actions[1].condition);
 const input=networks[1].actions[0].condition!;
 assert.equal(input.kind,'contact');if(input.kind==='contact')assert.equal(input.instruction,p.instructions[2]);
 assert.deepEqual(networks.flatMap(n=>n.warnings),[]);
 assert.deepEqual(networks.flatMap(n=>n.instructions),p.instructions);assert.deepEqual(p,before);
});

test('FUNAND and FBEAND remain serial boolean conditions feeding the later output',()=>{
 const p=program(['LD R9830','FUNAND EQ dummyLeft dummyRight','FBEAND TON dummyTimer T#4.1s dummyElapsed',
  'OUT MR9831','FBEXEC StoragePrint dummyWriter dummyPath dummyText dummyBusy dummyError dummyErrorCode']);
 const networks=buildKeyenceNetworks(p),network=networks[0];
 assert.equal(networks.length,1);
 assert.deepEqual(network.actions.map(a=>a.instruction.opcode),['OUT','FBEXEC']);
 assert.equal(condition(network.actions[0].condition),'((R9830 & FUNAND:EQ) & FBEAND:TON)');
 assert.equal(network.actions[1].condition,network.actions[0].condition);
 assert.equal(network.actions[1].instruction.fb?.instance,'dummyWriter');
 assert.deepEqual(network.warnings,[]);
 assert.deepEqual(network.instructions,p.instructions);
});

test('MPS MRD and MPP restore the same prefix across function and function-block branches',()=>{
 const p=program(['LD R9840','MPS','FUNAND EQ dummyLeft dummyRight','FUN MOVE dummySource dummyDestination',
  'MRD','FBEAND TON dummyTimer T#4.1s dummyElapsed','OUT MR9841',
  'MPP','FUNLD DegToRad dummyRadians dummyDegrees','ANL','FUN SIN dummySine dummyRadians',
  'LD R9842','OUT MR9843']);
 const before=structuredClone(p),networks=buildKeyenceNetworks(p),actions=networks[0].actions;
 assert.equal(networks.length,2);
 assert.deepEqual(actions.map(a=>condition(a.condition)),[
  '(R9840 & FUNAND:EQ)','(R9840 & FBEAND:TON)','(R9840 & FUNLD:DegToRad)',
 ]);
 assert.deepEqual(actions.map(a=>a.instruction.fb?.name??a.instruction.opcode),['MOVE','OUT','SIN']);
 const first=actions[0].condition!;assert.equal(first.kind,'and');
 if(first.kind==='and')for(const action of actions.slice(1)){
  assert.equal(action.condition?.kind,'and');
  if(action.condition?.kind==='and')assert.equal(action.condition.left,first.left,'restored prefixes retain object identity');
 }
 assert.equal(condition(networks[1].actions[0].condition),'R9842');
 assert.deepEqual(networks.flatMap(n=>n.warnings),[]);
 assert.deepEqual(networks.flatMap(n=>n.instructions),p.instructions);assert.deepEqual(p,before);
});

test('ST and annotation markers become independent networks without inheriting adjacent conditions',()=>{
 for(const [bookmark,comment] of [['BOOKMARK','RUNG_COMMENT'],['bookmark','rung_comment']]){
  const p=program(['LD R9850','OUT MR9851','AREA_ST',';\tuiDummy := 47;',bookmark,';Dummy section',
   'LD R9852','OUT MR9853',comment,';Dummy first note',';Dummy second note','LD R9854','OUT MR9855','END','ENDH']);
  const before=structuredClone(p),networks=buildKeyenceNetworks(p);
  assert.deepEqual(networks.map(n=>n.instructions.map(i=>i.opcode)),[
   ['LD','OUT'],['AREA_ST'],[bookmark],['LD','OUT'],[comment],['LD','OUT'],['END'],['ENDH'],
  ]);
  assert.equal(networks[1].actions[0].condition,null);
  assert.equal(networks[1].actions[0].instruction,p.instructions[2]);
  assert.deepEqual(networks[1].instructions[0].st?.lines.map(line=>line.text),['\tuiDummy := 47;']);
  assert.equal(networks[2].statement,'Dummy section');assert.equal(networks[4].statement,'Dummy first note\nDummy second note');
  for(const index of [2,4]){assert.deepEqual(networks[index].actions,[]);assert.equal(networks[index].condition,null);}
  assert.equal(networks[3].statement,'');assert.equal(networks[5].statement,'');
  assert.equal(condition(networks[3].actions[0].condition),'R9852');
  assert.equal(condition(networks[5].actions[0].condition),'R9854');
  assert.deepEqual(networks.flatMap(n=>n.warnings),[]);
  assert.deepEqual(networks.flatMap(n=>n.instructions),p.instructions);assert.deepEqual(p,before);
 }
});

test('known terminal function and stateful block calls are complete without a following coil',()=>{
 for(const lines of [
  ['FUNLD DegToRad dummyRadians dummyDegrees'],
  ['LD R9860','FBEAND TON dummyTimer T#4.1s dummyElapsed'],
 ]){
  const p=program([...lines,'END']),networks=buildKeyenceNetworks(p);
  assert.deepEqual(networks.flatMap(n=>n.warnings),[]);
  assert.equal(networks[0].actions.length,0,'an inline function does not create a duplicate output action');
  assert.ok(networks[0].condition);
  assert.deepEqual(networks.flatMap(n=>n.instructions),p.instructions);
 }
 for(const lines of [['LD R9861'],['LD R9862','FUNAND EQ dummyLeft dummyRight']]){
  const networks=buildKeyenceNetworks(program([...lines,'END']));
  assert.ok(networks[0].warnings.some(w=>w.includes('出力命令がありません')),'a pure condition still needs a destination');
 }
});

test('malformed KV-X function branches keep their instructions and report missing conditions',()=>{
 for(const command of ['FUNAND EQ dummyLeft dummyRight','FBEAND TON dummyTimer T#4.1s dummyElapsed']){
  const p=program([command,'OUT MR9870']),networks=buildKeyenceNetworks(p);
  assert.ok(networks[0].warnings.some(w=>w.includes('前にLD接点がありません')));
  assert.deepEqual(networks.flatMap(n=>n.instructions),p.instructions);
 }
 const p=program(['LD R9871','MPS','FUNAND EQ dummyLeft dummyRight','OUT MR9872','AREA_ST',';uiDummy := 53;','MPP','OUT MR9873']);
 const networks=buildKeyenceNetworks(p);
 assert.ok(networks[0].warnings.some(w=>w.includes('対応するMPPがありません')));
 assert.ok(networks[2].warnings.some(w=>w.includes('対応するMPSがありません')),'a branch stack cannot leak through an independent ST block');
 assert.deepEqual(networks.flatMap(n=>n.instructions),p.instructions);
});
