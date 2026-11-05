import test from 'node:test';
import assert from 'node:assert/strict';
import {buildProgram,type Instruction} from '../src/model.ts';
import {gridLayout,PAGE_GAP} from '../src/layout.ts';
import {instructionDrawingOffset} from '../src/NetworkDrawing.tsx';

type Command=[string,...string[]];
function syntheticProgram(commands:Command[]) {
 const instructions=commands.map(([op,...operands],index):Instruction=>({
  id:`navigation-${index}`,sourceRow:index+1,step:String(index),op,operands,note:'',statement:''
 }));
 return buildProgram(instructions,'synthetic-navigation.csv');
}

test('navigation includes title and warning prefix and resolves hidden instructions nearby',()=>{
 const p=syntheticProgram([['LD','X0'],['MPS'],['OUT','Y0'],['MPP'],['OUT','Y1']]);
 const n=p.networks[0],rowHeight=72,zoom=1.5;
 n.title='synthetic\nheading';n.warnings=['synthetic warning one','synthetic warning two'];
 const prefix=2*18*zoom+2*25;
 assert.equal(instructionDrawingOffset(n,p.instructions[4].id,rowHeight,zoom,'wrap'),prefix+rowHeight*zoom);
 assert.equal(instructionDrawingOffset(n,p.instructions[1].id,rowHeight,zoom,'wrap'),prefix);
 assert.equal(instructionDrawingOffset(n,'not-in-network',rowHeight,zoom,'wrap'),0);
});

test('navigation uses comparison row alignment once without changing the mapping',()=>{
 const p=syntheticProgram([['LD','X3'],['OUT','Y3'],['OUT','Y4']]);
 const n=p.networks[0],rowHeight=80,zoom=0.75;
 n.rowAlignment=[1,4];
 assert.equal(instructionDrawingOffset(n,p.instructions[0].id,rowHeight,zoom,'wrap'),rowHeight*zoom);
 assert.equal(instructionDrawingOffset(n,p.instructions[2].id,rowHeight,zoom,'wrap'),4*rowHeight*zoom);
 assert.deepEqual(n.rowAlignment,[1,4]);
});

test('long-circuit navigation follows wrapped pages and keeps horizontal display on one page',()=>{
 const contacts:Command[]=[['LD','X10'],...Array.from({length:25},(_,index):Command=>['AND',`X${index+11}`])];
 const p=syntheticProgram([...contacts,['OUT','Y10']]);
 const n=p.networks[0],rowHeight=64,zoom=1.25,target=p.instructions.at(-1)!;
 n.title='synthetic long';
 assert.equal(gridLayout(n).rows,1);assert.equal(gridLayout(n).pages,3);
 assert.equal(instructionDrawingOffset(n,target.id,rowHeight,zoom,'wrap'),18*zoom+2*(rowHeight+PAGE_GAP)*zoom);
 assert.equal(instructionDrawingOffset(n,target.id,rowHeight,zoom,'scroll'),18*zoom);
});

test('pointer navigation accounts for the master-control header and aligned row',()=>{
 const p=syntheticProgram([['LD','X1'],['MC','N2','M81'],['P42'],['LD','X2'],['OUT','Y2'],['MCR','N2']]);
 const n=p.networks.find(network=>network.pointer)!;
 assert.ok(n.masterControl);assert.equal(n.pointer!.op,'P42');
 n.rowAlignment=[0,3];
 const rowHeight=72,zoom=1.25;
 assert.equal(instructionDrawingOffset(n,n.pointer!.id,rowHeight,zoom,'wrap'),3*rowHeight*zoom);
});

test('FB-pin navigation includes the parent position and internal pin spacing',()=>{
 const p=syntheticProgram([
  ['LD','X1'],['FBCALL SyntheticBlock'],['SyntheticBlock IN:Enable','M1'],
  ['SyntheticBlock IN:Value','D1'],['SyntheticBlock OUT:Result','D2']
 ]);
 const n=p.networks[0],rowHeight=84,zoom=1.5,parent=p.instructions[1];
 n.title='synthetic FB';n.warnings=['synthetic warning'];
 const prefix=18*zoom+25;
 assert.equal(parent.pins!.length,3);
 assert.equal(instructionDrawingOffset(n,parent.id,rowHeight,zoom,'wrap'),prefix);
 assert.equal(instructionDrawingOffset(n,parent.pins![1].id,rowHeight,zoom,'wrap'),prefix+(24+22)*zoom);
 assert.equal(instructionDrawingOffset(n,parent.pins![2].id,rowHeight,zoom,'wrap'),prefix+(24+44)*zoom);
});
