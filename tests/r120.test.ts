import test from 'node:test';
import assert from 'node:assert/strict';
import {parseProgram,type Logic} from '../src/model.ts';
import {isComparisonCondition,isInlineLogic,isPointerDefinition,logicOperation} from '../src/instructions.ts';
import {gridLayout} from '../src/layout.ts';

type Command=[string,...string[]];
function program(commands:Command[]) {
 const rows=commands.flatMap(([op,...operands],index)=>[
  [String(index),'',op,operands[0]??''],...operands.slice(1).map(operand=>['','','',operand])
 ]);
 const text=[['ステップ番号','行間ステートメント','命令','I/O(デバイス)'],...rows]
  .map(row=>row.map(value=>'"'+value.replaceAll('"','""')+'"').join('\t')).join('\n');
 return parseProgram(text,'synthetic-r120.csv');
}
function expression(logic:Logic|null):unknown {
 return !logic?null:logic.kind==='contact'
  ?[logic.instruction.op,...logic.instruction.operands]:[logic.kind,...logic.children.map(expression)];
}

test('typed and unsigned comparisons remain LD/AND/OR conditions with their original opcodes',()=>{
 const families:[string,string,string][]=[
  ['LD>=_U','AND<_U','OR=_U'],['LD$=','AND$<>','OR$='],
  ['LDED>=','ANDED<','ORED='],['LDDT<=','ANDDT>=','ORDT<>'],['LDTM<=','ANDTM>','ORTM=']
 ];
 for(const [load,and,or] of families){
  for(const [index,op] of [load,and,or].entries()){
   assert.equal(isComparisonCondition(op),true,op);
   assert.equal(logicOperation(op),['load','and','or'][index],op);
  }
  const p=program([[load,'D401','K5'],[and,'D402','K6'],[or,'D403','K7'],['OUT','M9401']]);
  assert.equal(p.networks.length,1,load);
  const network=p.networks[0];
  assert.deepEqual(network.actions.map(action=>action.instruction.op),['OUT'],load);
  assert.deepEqual(expression(network.actions[0].condition),
   ['or',['and',[load,'D401','K5'],[and,'D402','K6']],[or,'D403','K7']],load);
  assert.deepEqual(gridLayout(network).symbols.filter(symbol=>symbol.contact).map(symbol=>symbol.instruction.op),[load,and,or]);
  assert.deepEqual(network.warnings,[]);
 }
});

test('hash pointers and interrupt definitions label their rungs without becoming command boxes',()=>{
 const p=program([['#P241'],['LD','X51'],['OUT','Y71'],['I27'],['LD','X52'],['OUT','Y72']]);
 assert.equal(p.networks.length,2);
 assert.deepEqual(p.networks.map(network=>network.pointer?.op),['#P241','I27']);
 assert.deepEqual(p.networks.map(network=>network.actions.map(action=>action.instruction.op)),[['OUT'],['OUT']]);
 for(const label of ['#P241','I27'])assert.equal(isPointerDefinition(label),true);
 assert.ok(!p.networks.flatMap(network=>gridLayout(network).symbols).some(symbol=>isPointerDefinition(symbol.instruction.op)));
 assert.deepEqual(p.networks.flatMap(network=>network.instructions).map(instruction=>instruction.id),p.instructions.map(instruction=>instruction.id));
 assert.deepEqual(p.networks.flatMap(network=>network.warnings),[]);
});

test('EGP and EGF remain inline conditions before the output',()=>{
 const p=program([['LD','X63'],['EGP','V17'],['EGF','V18'],['OUT','Y83']]);
 assert.equal(p.networks.length,1);
 const network=p.networks[0];
 assert.deepEqual(network.actions.map(action=>action.instruction.op),['OUT']);
 assert.deepEqual(expression(network.actions[0].condition),['and',['and',['LD','X63'],['EGP','V17']],['EGF','V18']]);
 for(const op of ['EGP','EGF'])assert.equal(isInlineLogic(op),true);
 assert.deepEqual(gridLayout(network).symbols.filter(symbol=>symbol.contact).map(symbol=>symbol.instruction.op),['LD','EGP','EGF']);
 assert.deepEqual(network.warnings,[]);
});

test('phase resets keep two phases independent and retain every original marker',()=>{
 const p=program([
  ['PHASE','M9311'],['OUT','Y91'],['AND','X71'],['PHASECHG','M9312'],['PHASERST'],
  ['PHASE','M9312'],['OUT','Y92'],['AND','X72'],['PHASECHG','M9313'],['PHASERST']
 ]);
 assert.equal(p.networks.length,2);
 for(const [index,network] of p.networks.entries()){
  const phase=index?'M9312':'M9311',input=index?'X72':'X71';
  assert.deepEqual(network.actions.map(action=>action.instruction.op),['OUT','PHASECHG']);
  assert.deepEqual(expression(network.actions[0].condition),['PHASE',phase]);
  assert.deepEqual(expression(network.actions[1].condition),['and',['PHASE',phase],['AND',input]]);
  assert.equal(network.instructions.at(-1)?.op,'PHASERST');
  const symbols=gridLayout(network).symbols;
  assert.equal(symbols.filter(symbol=>symbol.contact&&symbol.instruction.op==='PHASE').length,1);
  assert.ok(!symbols.some(symbol=>symbol.instruction.op==='PHASERST'));
 }
 assert.deepEqual(p.networks.flatMap(network=>network.instructions).map(instruction=>instruction.id),p.instructions.map(instruction=>instruction.id));
 assert.deepEqual(p.networks.flatMap(network=>network.warnings),[]);
});

test('MC adds a header row to the next rung and MCR closes that boundary',()=>{
 const p=program([
  ['LD','X171'],['MC','N3','M9671'],['LD','X172'],['OUT','Y172'],
  ['MCR','N3'],['LD','X173'],['OUT','Y173']
 ]);
 assert.deepEqual(p.networks.map(network=>network.actions.map(action=>action.instruction.op)),[['MC'],['OUT'],['MCR'],['OUT']]);
 const controlled=p.networks[1],reset=p.networks[2],after=p.networks[3];
 assert.equal(controlled.masterControl,p.instructions.find(instruction=>instruction.op==='MC'));
 assert.deepEqual(controlled.masterControl?.operands,['N3','M9671']);
 assert.equal(reset.masterControl,undefined);assert.equal(after.masterControl,undefined);
 assert.equal(reset.actions[0].condition,null);
 const grid=gridLayout(controlled);
 assert.ok(grid.symbols.every(symbol=>symbol.row>=1));
 assert.equal(grid.rows,2);
 assert.ok(gridLayout(after).symbols.every(symbol=>symbol.row===0));
 assert.deepEqual(p.networks.flatMap(network=>network.instructions).map(instruction=>instruction.id),p.instructions.map(instruction=>instruction.id));
 assert.deepEqual(p.networks.flatMap(network=>network.warnings),[]);
});

test('unconditional control instructions do not inherit the preceding rung condition',()=>{
 const controls:Command[]=[['JMP','#P521'],['NOP'],['DI'],['EI'],['IMASK','K9']];
 for(const command of controls){
  const p=program([['LD','X181'],['OUT','Y181'],command,['OUT','Y182']]);
  const actions=p.networks.flatMap(network=>network.actions);
  assert.deepEqual(actions.map(action=>action.instruction.op),['OUT',command[0],'OUT']);
  assert.deepEqual(expression(actions[0].condition),['LD','X181']);
  assert.equal(actions[1].condition,null,command[0]);
  assert.equal(actions[2].condition,null,command[0]);
  assert.deepEqual(p.networks.flatMap(network=>network.warnings),[]);
 }
});
