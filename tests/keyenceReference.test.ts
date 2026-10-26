import test from 'node:test';
import assert from 'node:assert/strict';
import {parseKeyenceMnm} from '../src/keyence/parser.ts';
import {buildKeyenceNetworks} from '../src/keyence/logic.ts';
import {layoutKeyenceNetwork} from '../src/keyence/layout.ts';
import {compareKeyencePrograms,keyenceComparisonDrawings} from '../src/keyence/comparison.ts';
import {keyenceInstructionCopyText} from '../src/keyence/instructionCopy.ts';
import {parseCsvBatch} from '../src/batch.ts';
const bytes=(s:string)=>new TextEncoder().encode(s).buffer;
const mnm=(commands:string[])=>['DEVICE:99',';MODULE:Synthetic',...commands].join('\n');
const parse=(commands:string[],html?:string)=>parseKeyenceMnm(bytes(mnm(commands)),'Synthetic.mnm',{},html);
const reference='<title>Synthetic</title><table class="FBTable"><tr><td><div class="FBTitle">Simple</div></td></tr><tr><td><div class="FBDeviceName FBDeviceIn">DM1</div><div class="FBDeviceComment">source</div></td><td><div class="FBParamName FBParamIn">value</div><div class="FBParamComment">input value</div></td></tr><tr><td><div class="FBParamName FBParamOut">result</div></td><td><div class="FBDeviceName FBDeviceOut">DM2</div></td></tr></table>';
const scriptReference='<title>Synthetic</title><div class="ScriptLayout">DM1 = 2<br>DM2 = 3</div>';
const scriptCommands=[';DM1 = 2',';DM2 = 3','LD CR2002','NCJ #1000','LD CR2002','MOV #2 DM1','LD CR2002','MOV #3 DM2','LABEL #1000','END'];

test('FB without an exported definition keeps every argument in a simple vertical block',()=>{
 const p=parse(['LD MR1','FB Locked DM1 #2 DM3','END']),network=buildKeyenceNetworks(p)[0];
 const fb=p.instructions[1].fb!;
 assert.equal(fb.defined,false);assert.deepEqual(fb.pins.map(p=>[p.name,p.direction,p.value]),[['引数1','argument','DM1'],['引数2','argument','#2'],['引数3','argument','DM3']]);
 const d=layoutKeyenceNetwork(network,p),symbol=d.symbols.find(s=>s.kind==='fb')!;
 assert.ok(symbol.blockRows!>1);assert.ok(symbol.width<=8*74);
 assert.match(keyenceInstructionCopyText(p.instructions[1],p),/引数3: DM3/);
});

test('same-name HTML supplies verified pin names and never executes markup or loads images',()=>{
 const p=parse(['LD MR1','FB Simple DM1 DM2','END'],reference+'<script>throw new Error("never run")</script><img src="https://example.invalid/no">');
 const fb=p.instructions[1].fb!;
 assert.equal(fb.defined,true);assert.deepEqual(fb.pins.map(p=>[p.name,p.direction,p.operandIndex]),[['value','in',1],['result','out',2]]);
 assert.match(keyenceInstructionCopyText(p.instructions[1],p),/value: DM1 \/ source \/ input value/);
 assert.equal(parse(['LD MR1','FB Simple DM1 DM9'],reference).instructions[1].fb?.defined,false);
 assert.equal(parse(['LD MR1','FB Simple DM1 DM2'],reference.replace('Synthetic</title>','Other</title>')).instructions[1].fb?.defined,false);
});

test('script display retains all original commands for comparison and hidden-command navigation',()=>{
 const p=parse(scriptCommands,scriptReference),before=structuredClone(p),networks=buildKeyenceNetworks(p);
 assert.deepEqual(networks.flatMap(n=>n.instructions).map(i=>i.raw),p.instructions.map(i=>i.raw));
 assert.equal(networks.length,2);
 const owner=p.instructions.find(i=>i.script)!;
 assert.equal(owner.script!.bodyIds.length,5);assert.equal(owner.script!.text,'DM1 = 2\nDM2 = 3');
 const drawing=layoutKeyenceNetwork(networks[0],p),box=drawing.symbols.find(s=>s.kind==='script')!;
 assert.deepEqual(box.bodyLines,['DM1 = 2','DM2 = 3']);assert.deepEqual(p,before);
 assert.ok(!networks[0].statement.includes('DM1 = 2'));
 assert.match(keyenceInstructionCopyText(owner,p),/DM2 = 3/);
});

test('HTML availability is display metadata and compiled changes inside a script are still detected',()=>{
 const left=parse(scriptCommands,scriptReference),plain=parse(scriptCommands),same=compareKeyencePrograms(left,plain);
 assert.equal(same.changes.length,0);assert.equal(same.groups.length,2);
 const right=parse(scriptCommands.map(s=>s==='MOV #3 DM2'?'MOV #4 DM2':s),scriptReference),changed=compareKeyencePrograms(left,right);
 assert.equal(changed.changes.length,1);assert.equal(changed.changes[0].target?.opcode,'MOV');
 for(const g of keyenceComparisonDrawings(changed,true,'wrap'))for(const d of [...g.source,...g.target])assert.ok(d.wires.every(w=>!w.difference));
 const fbSame=compareKeyencePrograms(parse(['LD MR1','FB Simple DM1 DM2','END'],reference),parse(['LD MR1','FB Simple DM1 DM2','END']));
 assert.equal(fbSame.changes.length,0);
});

test('reference HTML stays attached to its own program in a mixed batch',()=>{
 const result=parseCsvBatch([{name:'Synthetic.mnm',folder:'a',bytes:bytes(mnm(['LD MR1','FB Simple DM1 DM2'])),referenceHtml:reference},{name:'Synthetic.mnm',folder:'b',bytes:bytes(mnm(['LD MR1','FB Simple DM1 DM2']))}]);
 assert.equal(result.errors.length,0);assert.equal(result.keyencePrograms[0].instructions[1].fb?.defined,true);assert.equal(result.keyencePrograms[1].instructions[1].fb?.defined,false);
});