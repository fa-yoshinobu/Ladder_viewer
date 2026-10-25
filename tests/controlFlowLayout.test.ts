import test from 'node:test';
import assert from 'node:assert/strict';
import {parseProgram} from '../src/model.ts';
import {gridLayout,drawingPages,displayGrid,networkSize,COLUMNS,CELL,LEFT_GUTTER} from '../src/layout.ts';

const program=(commands:string[])=>parseProgram('ステップ番号\t命令\tI/O(デバイス)\n'+commands.map((command,index)=>index+'\t'+command).join('\n'),'synthetic.csv');

test('ST boundaries isolate branch bodies while THEN retains its contact condition',()=>{
 const p=program(['IF','LD\tX8','THEN','OUT\tY8','ELSE','OUT\tY9','ENDIF','LD\tX9','OUT\tY10']);
 const gate=p.networks.find(n=>n.instructions.some(i=>i.op==='THEN'))!;
 assert.equal(gate.actions[0].condition?.kind,'contact');
 for(const address of ['Y8','Y9']){
  const n=p.networks.find(n=>n.instructions.some(i=>i.operands.includes(address)))!;
  assert.equal(n.actions[0].condition,null);
  assert.equal(n.controlRanges?.[0].kind,'IF');
 }
 const ordinary=p.networks.at(-1)!;
 assert.equal(ordinary.controlRanges,undefined);
 assert.equal(ordinary.actions[0].condition?.kind,'contact');
 assert.equal(gridLayout(ordinary).pages,1);
 assert.equal(gridLayout(ordinary).symbols.at(-1)!.col,COLUMNS-1);
});

test('standalone ST markers have no invented rung wiring or right-rail return',()=>{
 const p=program(['STPUSH','IF','LD\tX8','THEN','OUT\tY8','ENDIF','STPOP','FBRET']);
 for(const n of p.networks.filter(n=>n.instructions.length===1&&n.instructions[0].op!=='OUT')){
  const grid=gridLayout(n);
  assert.equal(grid.wires.length,0,n.instructions[0].op);
  assert.equal(grid.symbols[0].col,0);
  assert.equal(drawingPages(grid,56,'wrap')[0].outputs.length,0);
 }
});

test('generated memory operations retain the boolean and branch stacks without becoming rung outputs',()=>{
 const p=program(['IF','LD\tX8','MPS','_TMFREE\tK1','MRD','AND\tX9','_TMALLOC\tK1','MPP','THEN','OUT\tY8','ENDIF']);
 const gate=p.networks.find(n=>n.instructions.some(i=>i.op==='THEN'))!;
 assert.equal(gate.actions.at(-1)!.condition?.kind,'contact');
 assert.equal(gate.warnings.length,0);
 const grid=gridLayout(gate);
 for(const symbol of grid.symbols.filter(s=>s.instruction.op==='_TMFREE'||s.instruction.op==='_TMALLOC')){
  assert.equal(grid.wires.some(w=>w.y1===symbol.row&&w.y2===symbol.row&&w.x2===symbol.col),false);
 }
 assert.deepEqual(p.networks.flatMap(n=>n.instructions.map(i=>i.op)),['IF','LD','MPS','_TMFREE','MRD','AND','_TMALLOC','MPP','THEN','OUT','ENDIF']);
});

test('scratch loads inside ST do not become unfinished ordinary ladder branches',()=>{
 const p=program(['STPUSH','IF','LD\tX8','LD\tX9','THEN','OUT\tY8','ENDIF','STPOP']);
 assert.equal(p.networks.flatMap(n=>n.warnings).length,0);
 const gate=p.networks.find(n=>n.instructions.some(i=>i.op==='THEN'))!;
 assert.deepEqual(gate.actions[0].condition,{kind:'contact',instruction:p.instructions.find(i=>i.op==='LD'&&i.operands[0]==='X9')});
 const ordinary=program(['LD\tX8','LD\tX9','OUT\tY8']);
 assert.ok(ordinary.networks.flatMap(n=>n.warnings).some(w=>w.includes('分岐スタック')));
});

test('a long ST condition keeps the complete gate in the local horizontal viewport',()=>{
 const p=program(['IF',...Array.from({length:9},(_,index)=>(index?'AND':'LD')+'\tX'+index),'THEN','OUT\tY8','ENDIF']);
 const n=p.networks.find(n=>n.instructions.some(i=>i.op==='THEN'))!;
 assert.equal(gridLayout(n).pages,2);
 const grid=displayGrid(n,'scroll'),size=networkSize(n,56,'scroll');
 const end=Math.max(...grid.symbols.map(s=>s.col+s.span));
 assert.ok(size.width>=LEFT_GUTTER+end*CELL);
 assert.equal(grid.symbols.filter(s=>s.contact).length,9);
 assert.ok(grid.symbols.some(s=>s.instruction.op==='THEN'));
});
