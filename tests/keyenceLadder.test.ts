import test from 'node:test';
import assert from 'node:assert/strict';
import {parseKeyenceMnm} from '../src/keyence/parser.ts';
import {buildKeyenceNetworks} from '../src/keyence/logic.ts';
import {layoutKeyenceNetwork} from '../src/keyence/layout.ts';
import {CELL,COLUMNS} from '../src/ladderMetrics.ts';

type Expression=NonNullable<ReturnType<typeof buildKeyenceNetworks>[number]['actions'][number]['condition']>;
const program=(lines:string[])=>parseKeyenceMnm(new TextEncoder().encode(['DEVICE:99',';MODULE:SyntheticLogic',';MODULE_TYPE:0',...lines].join('\r\n')).buffer,'synthetic-logic.mnm');
function expression(value:Expression|null):string {
 if(!value)return 'TRUE';
 if(value.kind==='contact')return (value.negated?'!':'')+value.instruction.operands.join(' ');
 if(value.kind==='unary')return `${value.operation}(${expression(value.input)})`;
 return `(${expression(value.left)} ${value.kind==='and'?'&':'|'} ${expression(value.right)})`;
}
const outputs=(networks:ReturnType<typeof buildKeyenceNetworks>)=>networks.flatMap(network=>network.actions.filter(action=>['OUT','SET','RES','RST'].includes(action.instruction.opcode)));

test('Keyence ANB and ORB are inverted contacts and never Mitsubishi block joins',()=>{
 const p=program(['LD CR9001','ANB MR11','ORB MR12','OUT MR20','END','ENDH']);
 const networks=buildKeyenceNetworks(p),actions=outputs(networks);
 assert.equal(actions.length,1);
 assert.equal(expression(actions[0].condition),'((CR9001 & !MR11) | !MR12)');
 assert.deepEqual(networks.flatMap(network=>network.warnings),[]);
 const logic=actions[0].condition!;
 assert.equal(logic.kind,'or');
 if(logic.kind==='or'){
  assert.equal(logic.right.kind,'contact');
  if(logic.right.kind==='contact'){
   assert.equal(logic.right.instruction,p.instructions[2]);
   assert.equal(logic.right.negated,true);assert.equal(logic.right.pulse,null);assert.equal(logic.right.comparison,null);
  }
 }
});

test('Keyence ANL joins two loaded blocks with AND and ORL joins them with OR',()=>{
 for(const [join,operator] of [['ANL','&'],['ORL','|']] as const){
  const p=program(['LD MR1','OR MR2','LD MR3','AND MR4',join,'OUT MR20','END','ENDH']);
  const networks=buildKeyenceNetworks(p);
  assert.equal(expression(outputs(networks)[0].condition),`((MR1 | MR2) ${operator} (MR3 & MR4))`);
  assert.deepEqual(networks.flatMap(network=>network.warnings),[]);
  assert.deepEqual(networks.flatMap(network=>network.instructions).map(i=>i.id),p.instructions.map(i=>i.id));
 }
});

test('Keyence MPS MRD MPP restore each branch condition for multiple outputs',()=>{
 const p=program(['LD MR10','MPS','ANB MR11','OUT MR20','MRD','AND MR12','SET MR21','MPP','ORB MR13','OUT MR22','END','ENDH']);
 const networks=buildKeyenceNetworks(p),actions=outputs(networks);
 assert.deepEqual(actions.map(action=>action.instruction.operands[0]),['MR20','MR21','MR22']);
 assert.deepEqual(actions.map(action=>expression(action.condition)),['(MR10 & !MR11)','(MR10 & MR12)','(MR10 | !MR13)']);
 assert.deepEqual(networks.flatMap(network=>network.warnings),[]);
});

test('a normal LD after an output starts a separate Keyence network',()=>{
 const p=program(['LD MR1','OUT MR20','LD MR2','OUT MR21','END','ENDH']);
 const networks=buildKeyenceNetworks(p),rungs=networks.filter(network=>network.actions.some(action=>action.instruction.opcode==='OUT'));
 assert.equal(rungs.length,2);assert.notEqual(rungs[0].id,rungs[1].id);
 assert.deepEqual(outputs(rungs).map(action=>expression(action.condition)),['MR1','MR2']);
 assert.deepEqual(networks.flatMap(network=>network.instructions).map(i=>i.opcode),['LD','OUT','LD','OUT','END','ENDH']);
});

test('Keyence network building retains raw commands, comments, source rows and ENDH without mutating the MNM model',()=>{
 const p=program([';synthetic heading','  LD CR9001 ; synthetic inline comment','CUSTOM_OP "A B" DM200','OUT MR20','END','ENDH']);
 const before=structuredClone(p),networks=buildKeyenceNetworks(p);
 assert.deepEqual(p,before);
 assert.deepEqual(networks.flatMap(network=>network.instructions).map(i=>i.id),p.instructions.map(i=>i.id));
 assert.equal(networks[0].statement,'synthetic heading');
 assert.equal(p.instructions[0].raw,'  LD CR9001 ; synthetic inline comment');
 assert.equal(p.instructions[0].comment,'synthetic inline comment');assert.equal(p.instructions[0].sourceLine,5);
 assert.deepEqual(p.instructions[1].operands,['"A B"','DM200']);
 assert.deepEqual(networks.flatMap(network=>network.instructions).slice(-2).map(i=>i.opcode),['END','ENDH']);
 const again=buildKeyenceNetworks(p);
 assert.deepEqual(again.map(network=>network.instructions.map(i=>i.id)),networks.map(network=>network.instructions.map(i=>i.id)));
 assert.deepEqual(p,before);
});

test('missing Keyence block or branch stack produces warnings without dropping the original instruction',()=>{
 for(const opcode of ['ANL','ORL','MRD','MPP']){
  const p=program([opcode,'OUT MR20','END','ENDH']),networks=buildKeyenceNetworks(p);
  assert.ok(networks.some(network=>network.warnings.length>0),opcode+' must report its missing stack');
  assert.deepEqual(networks.flatMap(network=>network.instructions).map(i=>i.id),p.instructions.map(i=>i.id));
 }
});


function finiteDrawing(drawing:ReturnType<typeof layoutKeyenceNetwork>):void {
 for(const value of [drawing.width,drawing.height,drawing.headerHeight,drawing.left,drawing.right,drawing.railTop,drawing.railBottom,
  ...drawing.symbols.flatMap(s=>[s.x,s.y,s.width]),...drawing.wires.flatMap(w=>[w.x1,w.y1,w.x2,w.y2])])assert.ok(Number.isFinite(value));
 for(const wire of drawing.wires){
  assert.ok(wire.x1===wire.x2||wire.y1===wire.y2,'wires must be orthogonal');
  assert.ok(Math.min(wire.x1,wire.x2)>=drawing.left&&Math.max(wire.x1,wire.x2)<=drawing.right);
 }
 for(const symbol of drawing.symbols)assert.ok(symbol.x+symbol.width<=drawing.right);
}

test('Keyence shared conditions draw once and feed two separate output rows',()=>{
 const p=program(['LD MR1','OUT MR20','OUT MR21','END','ENDH']);
 const network=buildKeyenceNetworks(p)[0],before=structuredClone({p,network});
 const drawing=layoutKeyenceNetwork(network,p);
 const contacts=drawing.symbols.filter(s=>s.kind==='contact'),coils=drawing.symbols.filter(s=>s.kind==='coil');
 assert.equal(contacts.length,1);assert.equal(coils.length,2);assert.equal(drawing.rows,2);
 assert.notEqual(coils[0].y,coils[1].y);
 const end=contacts[0].x+contacts[0].width;
 assert.ok(coils.every(s=>s.x>=end));
 assert.ok(drawing.wires.some(w=>w.x1===end&&w.x2===end&&w.y1===coils[0].y&&w.y2===coils[1].y));
 finiteDrawing(drawing);assert.deepEqual({p,network},before);
});

test('Keyence OR branches merge before the following serial contact and output',()=>{
 const p=program(['LD MR1','OR MR2','AND MR3','OUT MR20','END','ENDH']);
 const drawing=layoutKeyenceNetwork(buildKeyenceNetworks(p)[0],p);
 const [a,b,c]=drawing.symbols.filter(s=>s.kind==='contact'),out=drawing.symbols.find(s=>s.kind==='coil')!;
 assert.equal(a.x,b.x);assert.ok(b.y>a.y);assert.equal(c.y,a.y);
 assert.equal(c.x,a.x+a.width);assert.ok(out.x>=c.x+c.width);
 assert.ok(drawing.wires.some(w=>w.x1===c.x&&w.x2===c.x&&w.y1===a.y&&w.y2===b.y));
 finiteDrawing(drawing);
});

test('Keyence inverted ANB and ORB remain contact symbols in layout',()=>{
 const p=program(['LD MR1','ANB MR2','ORB MR3','OUT MR20','END','ENDH']);
 const drawing=layoutKeyenceNetwork(buildKeyenceNetworks(p)[0],p);
 assert.deepEqual(drawing.symbols.filter(s=>s.kind==='contact').map(s=>[s.instruction.opcode,s.negated]),[['LD',false],['ANB',true],['ORB',true]]);
 finiteDrawing(drawing);
});

test('long Keyence command labels reserve space after every condition without backward output wires',()=>{
 const label='SYNTHETIC_PROCESSING_COMMAND_WITH_A_LONG_LABEL_'+ 'X'.repeat(100);
 const p=program(['LD MR1','AND MR2',label+' DM100 DM200','END','ENDH']);
 const drawing=layoutKeyenceNetwork(buildKeyenceNetworks(p)[0],p);
 const command=drawing.symbols.find(s=>s.kind==='command')!,contacts=drawing.symbols.filter(s=>s.kind==='contact');
 assert.equal(command.label,label+' DM100 DM200');
 assert.ok(command.x>=Math.max(...contacts.map(s=>s.x+s.width)));
 assert.equal(command.x+command.width,drawing.right-8);
 assert.ok(command.width>CELL*COLUMNS);
 for(const wire of drawing.wires)if(wire.y1===wire.y2)assert.ok(wire.x2>=wire.x1);
 finiteDrawing(drawing);
});

test('Keyence comment visibility preserves instructions and models while reducing row spacing',()=>{
 const p=program(['LD MR1 ; synthetic condition comment','OUT MR20 ; synthetic output comment','OUT MR21','END','ENDH']);
 const network=buildKeyenceNetworks(p)[0],before=structuredClone({p,network});
 const shown=layoutKeyenceNetwork(network,p,true),hidden=layoutKeyenceNetwork(network,p,false);
 assert.ok(shown.symbols.some(s=>s.commentLines.length>0));assert.ok(hidden.symbols.every(s=>s.commentLines.length===0));
 assert.deepEqual(hidden.symbols.map(s=>[s.instruction.id,s.label,s.x,s.width]),shown.symbols.map(s=>[s.instruction.id,s.label,s.x,s.width]));
 assert.ok(hidden.height<shown.height);
 assert.deepEqual({p,network},before);finiteDrawing(shown);finiteDrawing(hidden);
});


test('Keyence LD after MPP restores a final loaded block inside the same output network',()=>{
 const p=program(['LD MR1','MPS','LD MR2','ANL','OUT MR20','MRD','LD MR3','ANL','OUT MR21','MPP','LD MR4','ANL','OUT MR22','LD MR5','OUT MR23','END','ENDH']);
 const networks=buildKeyenceNetworks(p),rungs=networks.filter(n=>n.actions.some(a=>a.instruction.opcode==='OUT'));
 assert.equal(rungs.length,2);
 assert.deepEqual(rungs[0].actions.map(a=>a.instruction.operands[0]),['MR20','MR21','MR22']);
 assert.deepEqual(rungs[0].actions.map(a=>expression(a.condition)),['(MR1 & MR2)','(MR1 & MR3)','(MR1 & MR4)']);
 assert.equal(expression(rungs[1].actions[0].condition),'MR5');
 assert.deepEqual(networks.flatMap(n=>n.warnings),[]);
 assert.deepEqual(networks.flatMap(n=>n.instructions).map(i=>i.id),p.instructions.map(i=>i.id));
});

test('Keyence layout preserves output order when a shared condition reappears after another branch',()=>{
 const p=program(['LD MR1','AND MR2','OUT MR20','LD MR3','OUT MR21','OUT MR22']);
 const [first,second]=buildKeyenceNetworks(p),ab=first.actions[0].condition!;
 assert.equal(ab.kind,'and');
 if(ab.kind!=='and')return;
 const ac:Expression={kind:'and',left:ab.left,right:second.condition!};
 const network={...first,instructions:p.instructions,actions:[
  {...first.actions[0],condition:ab},
  {...second.actions[0],condition:ac},
  {...second.actions[1],condition:ab},
 ]};
 assert.equal(network.actions[0].condition,network.actions[2].condition,'the nonconsecutive prefix deliberately has object identity');
 const before=structuredClone({p,network}),drawing=layoutKeyenceNetwork(network,p);
 const coils=drawing.symbols.filter(s=>s.kind==='coil');
 assert.deepEqual(coils.map(s=>s.label),['MR20','MR21','MR22']);
 assert.ok(coils[0].y<coils[1].y&&coils[1].y<coils[2].y);
 assert.equal(drawing.symbols.filter(s=>s.kind==='contact'&&s.label==='MR2').length,2);
 finiteDrawing(drawing);assert.deepEqual({p,network},before);
});


for(const [name,branch,expected] of [
 ['serial contact before a loaded OR block',['AND MR3','LD MR4','OR MR5','ANL'],'((MR1 & MR3) & (MR4 | MR5))'],
 ['two nested loaded blocks',['LD MR3','LD MR4','ANL','ANL'],'(MR1 & (MR3 & MR4))'],
] as const){
 test('Keyence MPP restoration lasts until output with '+name,()=>{
  const p=program(['LD MR1','MPS','AND MR2','OUT MR20','MPP',...branch,'OUT MR21','LD MR6','OUT MR22','END','ENDH']);
  const before=structuredClone(p),networks=buildKeyenceNetworks(p);
  const rungs=networks.filter(n=>n.actions.some(a=>a.instruction.opcode==='OUT'));
  assert.equal(rungs.length,2);
  assert.deepEqual(rungs[0].actions.map(a=>a.instruction.operands[0]),['MR20','MR21']);
  assert.deepEqual(rungs[0].actions.map(a=>expression(a.condition)),['(MR1 & MR2)',expected]);
  assert.equal(expression(rungs[1].actions[0].condition),'MR6');
  assert.deepEqual(networks.flatMap(n=>n.warnings),[]);
  assert.deepEqual(networks.flatMap(n=>n.instructions).map(i=>i.id),p.instructions.map(i=>i.id));
  assert.deepEqual(p,before);
 });
}


test('Keyence KEEP retains independent SET and RES conditions in one network',()=>{
 const p=program(['LD MR1','LD MR2','KEEP MR20','LD MR3','OUT MR21','END','ENDH']);
 const before=structuredClone(p),networks=buildKeyenceNetworks(p);
 const keepNetwork=networks.find(n=>n.actions.some(a=>a.instruction.opcode==='KEEP'))!;
 const keep=keepNetwork.actions.find(a=>a.instruction.opcode==='KEEP')!;
 assert.equal(expression(keep.condition),'MR1');assert.equal(expression(keep.resetCondition??null),'MR2');
 assert.equal(keepNetwork.actions.length,1);
 assert.deepEqual(networks.flatMap(n=>n.warnings),[]);
 assert.deepEqual(networks.flatMap(n=>n.instructions).map(i=>i.id),p.instructions.map(i=>i.id));
 assert.deepEqual(p,before);
});

for(const [opcode,operation] of [['MEP','rise'],['MEF','fall'],['INV','invert']] as const){
 test('Keyence '+opcode+' stays inline while later loaded blocks and serial conditions are preserved',()=>{
  const p=program(['LD MR1',opcode,'LD MR2','OR MR3','ANL','AND MR4','OUT MR20','END','ENDH']);
  const before=structuredClone(p),networks=buildKeyenceNetworks(p);
  const rung=networks.find(n=>n.actions.some(a=>a.instruction.opcode==='OUT'))!;
  assert.equal(rung.actions.length,1);assert.equal(rung.actions[0].instruction.opcode,'OUT');
  assert.equal(expression(rung.actions[0].condition),`((${operation}(MR1) & (MR2 | MR3)) & MR4)`);
  assert.deepEqual(networks.flatMap(n=>n.warnings),[]);
  assert.deepEqual(networks.flatMap(n=>n.instructions).map(i=>i.id),p.instructions.map(i=>i.id));
  const drawing=layoutKeyenceNetwork(rung,p),inline=drawing.symbols.filter(s=>s.kind==='inline');
  assert.equal(inline.length,1);assert.equal(inline[0].instruction.opcode,opcode);assert.equal(inline[0].operation,operation);
  assert.equal(drawing.symbols.filter(s=>s.kind==='contact').length,4);
  const out=drawing.symbols.find(s=>s.kind==='coil')!;
  assert.ok(drawing.symbols.filter(s=>s.kind!=='coil').every(s=>s.x+s.width<=out.x));
  finiteDrawing(drawing);assert.deepEqual(p,before);
 });
}


test('Keyence bit operations are contacts while LDA and ANDA remain commands',()=>{
 for(const [opcode,join,negated] of [['BLD','load',false],['BLDB','load',true],['BAND','and',false],['BANB','and',true],['BOR','or',false],['BORB','or',true]] as const){
  const lines=join==='load'?[opcode+' DM200 #3','OUT MR20']:['LD CR9001',opcode+' DM200 #3','OUT MR20'];
  const p=program(lines),networks=buildKeyenceNetworks(p),rung=networks[0];
  assert.equal(rung.actions.length,1);assert.equal(rung.actions[0].instruction.opcode,'OUT');
  const condition=rung.actions[0].condition!;
  const bit=condition.kind==='and'||condition.kind==='or'?condition.right:condition;
  assert.equal(bit.kind,'contact');
  if(bit.kind==='contact'){
   assert.equal(bit.instruction.opcode,opcode);assert.equal(bit.negated,negated);assert.equal(bit.comparison,'B');
   assert.deepEqual(bit.instruction.operands,['DM200','#3']);
  }
  if(join!=='load')assert.equal(condition.kind,join);
  assert.deepEqual(networks.flatMap(n=>n.warnings),[]);
  const drawing=layoutKeyenceNetwork(rung,p);
  assert.equal(drawing.symbols.filter(s=>s.kind==='comparison').length,1);
  assert.equal(drawing.symbols.find(s=>s.kind==='comparison')!.label,'B DM200 #3');
  assert.equal(drawing.symbols.filter(s=>s.kind==='contact').length,join==='load'?0:1);finiteDrawing(drawing);
 }
 const p=program(['LD MR1','LDA DM100','ANDA DM101','OUT MR20']);
 const rung=buildKeyenceNetworks(p)[0];
 assert.deepEqual(rung.actions.map(a=>a.instruction.opcode),['LDA','ANDA','OUT']);
 assert.deepEqual(rung.actions.map(a=>expression(a.condition)),['MR1','MR1','MR1']);
});

test('Keyence CON command chain survives STA and leaves an unconnected output as a separate action',()=>{
 const p=program(['LD MR1','LDA DM100','CON','TBCD','CON','STA DM110','CON','MOV DM110 DM120','OUT MR20','END','ENDH']);
 const before=structuredClone(p),networks=buildKeyenceNetworks(p),rung=networks[0];
 assert.deepEqual(rung.actions.map(a=>a.instruction.opcode),['LDA','OUT']);
 const chain=rung.actions[0];
 assert.deepEqual(chain.continuations?.map(i=>i.opcode),['TBCD','STA','MOV']);
 assert.deepEqual(chain.continuations?.at(-1)?.operands,['DM110','DM120']);
 assert.equal(expression(chain.condition),'MR1');assert.equal(expression(rung.actions[1].condition),'MR1');
 assert.ok(!rung.actions[1].continuations?.length);
 assert.deepEqual(networks.flatMap(n=>n.instructions).map(i=>i.id),p.instructions.map(i=>i.id));
 assert.equal(rung.instructions.filter(i=>i.opcode==='CON').length,3);
 assert.deepEqual(networks.flatMap(n=>n.warnings),[]);
 const drawing=layoutKeyenceNetwork(rung,p);
 const commands=drawing.symbols.filter(s=>['command','calculation'].includes(s.kind)),out=drawing.symbols.find(s=>s.kind==='coil')!;
 assert.deepEqual(commands.map(s=>s.instruction.opcode),['LDA','TBCD','STA','MOV']);
 assert.ok(commands.every(s=>s.y===commands[0].y));
 assert.ok(commands.slice(1).every((s,i)=>s.x>=commands[i].x+commands[i].width));
 assert.notEqual(out.y,commands[0].y);
 finiteDrawing(drawing);assert.deepEqual(p,before);
});


test('Keyence KEEP draws the SET and RES input branches independently with SET above RES',()=>{
 const p=program(['LD MR1','LD MR2','KEEP MR20','END','ENDH']);
 const network=buildKeyenceNetworks(p)[0],before=structuredClone({p,network});
 const drawing=layoutKeyenceNetwork(network,p),keep=drawing.symbols.find(s=>s.kind==='keep')!;
 assert.ok(keep);assert.deepEqual(keep.ports?.map(port=>port.name),['SET','RES']);
 const [set,res]=keep.ports!;
 assert.ok(set.y<res.y);assert.ok(Number.isFinite(keep.height)&&keep.height!>res.y-set.y);
 const setContact=drawing.symbols.find(s=>s.label==='MR1')!,resContact=drawing.symbols.find(s=>s.label==='MR2')!;
 assert.equal(setContact.y,set.y);assert.equal(resContact.y,res.y);
 for(const contact of [setContact,resContact]){
  assert.ok(contact.x+contact.width<=keep.x);
  assert.ok(drawing.wires.some(w=>w.y1===contact.y&&w.y2===contact.y&&w.x1<=contact.x+contact.width&&w.x2===keep.x));
 }
 assert.ok(!drawing.wires.some(w=>w.x1===w.x2&&w.x1>drawing.left&&w.x1<=keep.x&&Math.min(w.y1,w.y2)<=set.y&&Math.max(w.y1,w.y2)>=res.y),
  'the independent SET and RES inputs must not be joined by a vertical wire');
 finiteDrawing(drawing);assert.deepEqual({p,network},before);
});
