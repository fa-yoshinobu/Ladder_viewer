import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeCsv, parseProgram, instructionKey, type Logic } from '../src/model.ts';
import { networkSize, gridLayout } from '../src/layout.ts';
import {isComparisonCondition,isInlineLogic,logicOperation} from '../src/instructions.ts';
function csv(lines: string[][]) { return ['"test"', '"機種情報:"\t"QCPU"', '"ステップ番号"\t"行間ステートメント"\t"命令"\t"I/O(デバイス)"\t"空欄"\t"PIステートメント"\t"ノート"', ...lines.map(r => r.map(s => `"${s.replaceAll('"', '""')}"`).join('\t'))].join('\r\n'); }
function expression(e: Logic | null): string { if (!e) return 'TRUE'; return e.kind === 'contact' ? e.instruction.operands.join(' ') : '(' + e.children.map(expression).join(e.kind === 'and' ? ' & ' : ' | ') + ')'; }

type Command=[string,...string[]];
const commandProgram=(commands:Command[])=>parseProgram(csv(commands.flatMap(([op,...operands],index)=>[
 [String(index),'',op,operands[0]??''],...operands.slice(1).map(operand=>['','','',operand])
])),'synthetic-instructions.csv');
function commandTree(logic:Logic|null):unknown {
 return !logic?null:logic.kind==='contact'
  ?[logic.instruction.op,...logic.instruction.operands]:[logic.kind,...logic.children.map(commandTree)];
}

test('GX project-only markers are removed from statements and notes', () => {
 const p = parseProgram(csv([['0','*周辺','','','','',''],['1','','LD','X0','','',''],['2','','OUT','Y0','','',''],['','','','','','','*メモ'],['3','[Title]見出し','','','','',''],['4','','LD','X1','','',''],['5','','OUT','Y1','','',''],['','','','','','','*二重*']]), 'gx.csv');
 assert.equal(p.networks[0].title,'周辺'); assert.equal(p.instructions[1].note,'メモ');
 assert.equal(p.networks[1].title,'[Title]見出し'); assert.equal(p.instructions[3].note,'二重*');
});

test('continuation operands, note and source mapping are retained', () => {
 const p = parseProgram(csv([['0','','LD','X9'],['1','','MOV','K1'],['','','','D21','','','メモ']]), 'x.csv');
 assert.deepEqual(p.instructions[1].operands, ['K1','D21']); assert.equal(p.instructions[1].note,'メモ'); assert.equal(p.instructions[1].sourceRow,5);
 assert.equal(instructionKey(p.instructions[1]), '["MOV",["K1","D21"]]');
});
test('parallel series and branch restoration retain output conditions', () => {
 const ops = [['LD','X0'],['OR','X1'],['MPS',''],['ANI','X2'],['OUT','Y0'],['MRD',''],['AND','X3'],['OUT','Y1'],['MPP',''],['LD','X4'],['OR','X5'],['ANB',''],['OUT','Y2']];
 const p = parseProgram(csv(ops.map(([op,arg],i)=>[String(i),'',op,arg])), 'x.csv');
 assert.equal(p.networks.length,1); assert.deepEqual(p.networks[0].actions.map(a=>expression(a.condition)), ['((X0 | X1) & X2)','((X0 | X1) & X3)','((X0 | X1) & (X4 | X5))']); assert.deepEqual(p.networks[0].warnings,[]);
});
test('malformed input and unbalanced branch do not silently succeed', () => {
 assert.throws(()=>parseProgram('a,b\n1,2','bad.csv'), /対応/);
 const p = parseProgram(csv([['0','','MPP',''],['1','','OUT','Y0']]), 'x.csv'); assert.match(p.networks[0].warnings[0], /不足|ありません/);
});
test('synthetic programs preserve every instruction and operand with finite layouts', () => {
 const rows = [
  ['0','','LD','X10'],['1','','MPS',''],['2','','AND','X11'],['3','','MOV','K7'],['','','','D10'],
  ['6','','MRD',''],['7','','ANI','X12'],['8','','MOV','K9'],['','','','D20'],
  ['11','','MPP',''],['12','','AND','X13'],['13','','OUT','Y10'],
  ['14','','LD','X20'],['15','','OR','X21'],['16','','MPS',''],['17','','SET','M10'],
  ['18','','MPP',''],['19','','RST','M11'],['20','','END','']
 ];
 const bytes = new TextEncoder().encode(csv(rows));
 const p = parseProgram(decodeCsv(bytes.buffer), 'synthetic.csv');
 assert.equal(p.instructions.length,17);
 assert.equal(p.networks.length,3);
 assert.equal(p.instructions.filter(i=>i.op==='MOV').length,2);
 assert.equal(p.instructions.filter(i=>i.op==='MPS').length,2);
 assert.equal(p.instructions.filter(i=>i.op==='MPP').length,2);
 assert.deepEqual(p.networks.flatMap(n=>n.instructions).map(i=>i.id),p.instructions.map(i=>i.id));
 assert.deepEqual(p.networks.flatMap(n=>n.warnings),[]);
 assert.deepEqual(p.instructions.filter(i=>i.op==='MOV').map(i=>i.operands),[['K7','D10'],['K9','D20']]);
 for(const n of p.networks) { const s=networkSize(n); assert.ok(Number.isFinite(s.height)&&s.height>0); assert.ok(Number.isFinite(s.width)&&s.width>0); }
});

test('grid keeps common contacts once and all network widths fixed', async () => {
 const {gridLayout}=await import('../src/layout.ts');
 const p=parseProgram(csv([['0','','LD','X9'],['1','','MOV','K1'],['','','','D21'],['3','','MOV','K2'],['','','','D540']]),'x');
 const g=gridLayout(p.networks[0]); assert.equal(g.symbols.filter(s=>s.contact).length,1); assert.equal(g.symbols.filter(s=>!s.contact).length,2);
 assert.equal(g.symbols.filter(s=>!s.contact)[0].col,g.symbols.filter(s=>!s.contact)[1].col);
});
test('synthetic FB pins, inline contacts and long circuits retain fixed-grid layout', async()=>{
 const {gridLayout,COLUMNS}=await import('../src/layout.ts');
 const rows = [
  ['0','','LDPI','X40'],['1','','ANDPI','X41'],['2','','INV',''],['3','','MEP',''],
  ['4','','FBCALL DemoBlock',''],
  ['5','','DemoBlock IN:Enable','M40'],['6','','DemoBlock IN:Value','D40'],
  ['7','','DemoBlock OUT:Result','D41'],['8','','DemoBlock IN_OUT:State','M41'],
  ['9','','LD','X50'],
  ...Array.from({length:10},(_,i)=>[String(10+i),'','AND',`X${51+i}`]),
  ['20','','AND=','D70'],['','','','K7'],['23','','ANI','X70'],['24','','OUT','Y50']
 ];
 const p=parseProgram(csv(rows),'synthetic-fb.csv');
 assert.equal(p.instructions.length,23);
 assert.equal(p.networks.length,2);
 assert.deepEqual(p.networks.flatMap(n=>n.warnings),[]);
 const fb=p.instructions.filter(i=>i.op.startsWith('FBCALL '));
 assert.equal(fb.length,1);
 assert.deepEqual(fb[0].pins?.map(i=>[i.op,i.operands]),[
  ['DemoBlock IN:Enable',['M40']],['DemoBlock IN:Value',['D40']],
  ['DemoBlock OUT:Result',['D41']],['DemoBlock IN_OUT:State',['M41']]
 ]);
 assert.ok(!p.networks.flatMap(n=>n.actions).some(a=>/ (IN|OUT|IN_OUT):/.test(a.instruction.op)));
 const grids=p.networks.map(gridLayout);
 assert.equal(new Set(grids.map(g=>g.width)).size,1);
 assert.ok(grids.some(g=>g.pages>1));
 const displayed=grids.flatMap(g=>g.symbols).filter(s=>s.contact).map(s=>s.instruction.op);
 for(const op of ['ANDPI','LDPI','INV','MEP','AND='])assert.ok(displayed.includes(op),op+' should be inline');
 for(const g of grids)for(const s of g.symbols)assert.ok(Math.floor(s.col/COLUMNS)===Math.floor((s.col+s.span-1)/COLUMNS),'symbol crosses a page');
});

test('Synthetic symbols: SET/RST/PLS and timer OUT stay commands',async()=>{
 const {isCoil}=await import('../src/layout.ts');
 const p=parseProgram(csv([['0','','OUT','M1'],['1','','OUT','T0'],['','','','K10'],['4','','SET','M2'],['5','','RST','Z8'],['6','','PLS','M3']]),'symbols');
 assert.deepEqual(p.instructions.map(isCoil),[true,false,false,false,false]);
});

test('pointer definitions label the following rung; CALL stays an action', async () => {
 const {gridLayout}=await import('../src/layout.ts');
 const p=parseProgram(csv([['0','TEST','P42',''],['0','','LD','X8'],['1','','SET','M5'],['3','','LD','M1'],['4','','CALL','P42'],['6','','P0',''],['6','','LD','M2'],['7','','OUT','Y0']]),'p.csv');
 assert.equal(p.networks.length,3);
 assert.equal(p.networks[0].pointer?.op,'P42');
 assert.equal(p.networks[0].title,'TEST');
 assert.deepEqual(p.networks[0].actions.map(a=>a.instruction.op),['SET']);
 assert.deepEqual(p.networks[1].actions.map(a=>a.instruction.op),['CALL']);
 assert.equal(p.networks[2].pointer?.op,'P0');
 assert.deepEqual(p.networks.flatMap(n=>n.instructions).map(i=>i.id),p.instructions.map(i=>i.id));
 assert.ok(!p.networks.flatMap(n=>gridLayout(n).symbols).some(s=>/^P\d+$/.test(s.instruction.op)));
 assert.deepEqual(p.networks.flatMap(n=>n.warnings),[]);
});

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
  const p=commandProgram([[load,'D401','K5'],[and,'D402','K6'],[or,'D403','K7'],['OUT','M9401']]);
  assert.equal(p.networks.length,1,load);
  const network=p.networks[0];
  assert.deepEqual(network.actions.map(action=>action.instruction.op),['OUT'],load);
  assert.deepEqual(commandTree(network.actions[0].condition),
   ['or',['and',[load,'D401','K5'],[and,'D402','K6']],[or,'D403','K7']],load);
  assert.deepEqual(gridLayout(network).symbols.filter(symbol=>symbol.contact).map(symbol=>symbol.instruction.op),[load,and,or]);
  assert.deepEqual(network.warnings,[]);
 }
});

test('EGP and EGF remain inline conditions before the output',()=>{
 const p=commandProgram([['LD','X63'],['EGP','V17'],['EGF','V18'],['OUT','Y83']]);
 assert.equal(p.networks.length,1);
 const network=p.networks[0];
 assert.deepEqual(network.actions.map(action=>action.instruction.op),['OUT']);
 assert.deepEqual(commandTree(network.actions[0].condition),['and',['and',['LD','X63'],['EGP','V17']],['EGF','V18']]);
 for(const op of ['EGP','EGF'])assert.equal(isInlineLogic(op),true);
 assert.deepEqual(gridLayout(network).symbols.filter(symbol=>symbol.contact).map(symbol=>symbol.instruction.op),['LD','EGP','EGF']);
 assert.deepEqual(network.warnings,[]);
});

test('phase resets keep two phases independent and retain every original marker',()=>{
 const p=commandProgram([
  ['PHASE','M9311'],['OUT','Y91'],['AND','X71'],['PHASECHG','M9312'],['PHASERST'],
  ['PHASE','M9312'],['OUT','Y92'],['AND','X72'],['PHASECHG','M9313'],['PHASERST']
 ]);
 assert.equal(p.networks.length,2);
 for(const [index,network] of p.networks.entries()){
  const phase=index?'M9312':'M9311',input=index?'X72':'X71';
  assert.deepEqual(network.actions.map(action=>action.instruction.op),['OUT','PHASECHG']);
  assert.deepEqual(commandTree(network.actions[0].condition),['PHASE',phase]);
  assert.deepEqual(commandTree(network.actions[1].condition),['and',['PHASE',phase],['AND',input]]);
  assert.equal(network.instructions.at(-1)?.op,'PHASERST');
  const symbols=gridLayout(network).symbols;
  assert.equal(symbols.filter(symbol=>symbol.contact&&symbol.instruction.op==='PHASE').length,1);
  assert.ok(!symbols.some(symbol=>symbol.instruction.op==='PHASERST'));
 }
 assert.deepEqual(p.networks.flatMap(network=>network.instructions).map(instruction=>instruction.id),p.instructions.map(instruction=>instruction.id));
 assert.deepEqual(p.networks.flatMap(network=>network.warnings),[]);
});

test('unconditional control instructions do not inherit the preceding rung condition',()=>{
 const controls:Command[]=[['JMP','#P521'],['NOP'],['DI'],['EI'],['IMASK','K9']];
 for(const command of controls){
  const commands:Command[]=[['LD','X181'],['OUT','Y181'],command,['OUT','Y182']];
  if(command[0]==='JMP')commands.unshift(['#P521']);
  const p=commandProgram(commands);
  const actions=p.networks.flatMap(network=>network.actions);
  assert.deepEqual(actions.map(action=>action.instruction.op),['OUT',command[0],'OUT']);
  assert.deepEqual(commandTree(actions[0].condition),['LD','X181']);
  assert.equal(actions[1].condition,null,command[0]);
  assert.equal(actions[2].condition,null,command[0]);
  if(command[0]==='JMP')assert.equal(actions[1].instruction.controlFlow?.targetId,p.instructions.find(instruction=>instruction.op==='#P521')?.id);
  assert.deepEqual(p.networks.flatMap(network=>network.warnings),[]);
 }
});
