import test from 'node:test';
import assert from 'node:assert/strict';
import {parseKeyenceMnm} from '../src/keyence/parser.ts';
import {buildKeyenceNetworks} from '../src/keyence/logic.ts';
import {layoutKeyenceNetwork,keyenceViewDrawing,type KeyenceDrawing} from '../src/keyence/layout.ts';
import {compareKeyencePrograms,keyenceComparisonDrawings} from '../src/keyence/comparison.ts';
import {compareConnectionGraphs} from '../src/connectionGraph.ts';
import {ROW} from '../src/ladderMetrics.ts';

// Independent synthetic programs, never copied from local reference files.
const program=(commands:string[])=>parseKeyenceMnm(new TextEncoder().encode(['DEVICE:99',...commands].join('\n')).buffer,'synthetic-ports.mnm');
const graph=(d:KeyenceDrawing)=>({railX:d.left,wires:d.wires,terminals:d.symbols.flatMap(s=>[
 ...s.ports?s.ports.map(p=>({x:s.x,y:p.y,key:s.instruction.id+':'+p.name,instruction:s.instruction.id+':'+p.name,input:true})):
 [{x:s.x,y:s.y,key:s.instruction.id+':in',instruction:s.instruction.id,input:true}],
 ...['contact','comparison','inline'].includes(s.kind)?[{x:s.x+s.width,y:s.y,key:s.instruction.id+':out',instruction:s.instruction.id,input:false}]:[],
])});

test('three-input symbols keep each independent condition connected to its named port',()=>{
 for(const [command,names] of [
  ['SFT MR8700 MR8715',['D','CLK','RES']],['UDT #21 #789',['UP','DW','RES']],
  ['UDC #22 #890',['UP','DW','RES']],['ITVL DM8800 MR8801',['PLS','PAUSE','RES']],
  ['ITVL.S DM8802 MR8803',['PLS','PAUSE','RES']],['PID DM8804 MR8805',['PAUSE','MANUAL','RES']],
 ] as const){
  const p=program(['LD R8500','LD R8501','LD R8502',command]);
  const d=layoutKeyenceNetwork(buildKeyenceNetworks(p)[0],p,false),block=d.symbols.find(s=>s.ports)!;
  assert.equal(block.kind,'multi-input');
  assert.deepEqual(block.ports!.map(p=>p.name),names);
  assert.equal(d.rows,3);
  block.ports!.forEach((port,index)=>{
   const input=d.symbols.find(s=>s.instruction.operands[0]===`R${8500+index}`)!;
   assert.equal(input.y,port.y);
   assert.ok(d.wires.some(w=>w.y1===port.y&&w.y2===port.y&&w.x1<=input.x+input.width&&w.x2>=block.x));
  });
  assert.ok(!d.wires.some(w=>w.x1===block.x&&w.x2===block.x&&w.y1!==w.y2),'independent inputs must not be shorted');
 }
});

test('three-input comparison aligns later inputs while retaining each side connections and colors',()=>{
 const target=['LD R8600','LD R8602','LD R8603','SFT MR8604 MR8619'];
 const source=['LD R8600','OR R8601',...target.slice(1)];
 for(const reverse of [false,true]){
  const comparison=compareKeyencePrograms(program(reverse?target:source),program(reverse?source:target));
  const aligned=keyenceComparisonDrawings(comparison,false,'scroll')[0],natural=keyenceComparisonDrawings(comparison,false,'scroll',false)[0];
  for(const side of ['source','target'] as const){
   const d=aligned[side][0],original=natural[side][0],block=d.symbols.find(s=>s.ports)!;
   assert.deepEqual(block.ports!.map(p=>(p.y-d.baseline)/ROW),[0,2,3]);
   for(const changes of compareConnectionGraphs([graph(original)],[graph(d)]))assert.deepEqual(changes.map(({wires,inputs,outputs})=>({wires,inputs,outputs})),[{wires:[],inputs:[],outputs:[]}]);
   assert.deepEqual(d.symbols.map(s=>[s.instruction.id,s.inputDifference,s.ports?.map(p=>p.difference)]),original.symbols.map(s=>[s.instruction.id,s.inputDifference,s.ports?.map(p=>p.difference)]));
  }
 }
});

test('wrapping retains all three input terminals and full symbol height',()=>{
 const p=program(['LD R8900',...Array.from({length:13},(_,i)=>`AND R${8901+i}`),'LD R8950','LD R8951','SFT MR8960 MR8975']);
 const base=layoutKeyenceNetwork(buildKeyenceNetworks(p)[0],p,false),wrapped=keyenceViewDrawing(base,'wrap');
 const block=wrapped.symbols.find(s=>s.ports)!;
 assert.ok(wrapped.continuationLabels!.length>1);
 assert.deepEqual(block.ports!.map(p=>p.y-block.y),[0,ROW,2*ROW]);
 assert.ok(block.ports!.at(-1)!.y<wrapped.height);
 assert.equal(wrapped.symbols.length,base.symbols.length);
});

test('MC and MCR symbols receive their corresponding control number',()=>{
 const p=program(['LD R8990','MC','LD R8991','OUT MR8992','MCR','LD R8993','MC','MCR']);
 const symbols=buildKeyenceNetworks(p).flatMap(n=>layoutKeyenceNetwork(n,p,false).symbols);
 assert.deepEqual(symbols.filter(s=>s.instruction.opcode==='MC'||s.instruction.opcode==='MCR').map(s=>s.controlLevel),[0,0,1,1]);
});

test('CON after a multiple-input output preserves the following command and output connection',()=>{
 for(const prefix of [['LD R8801','LD R8802','KEEP MR8804'],['LD R8801','LD R8802','LD R8803','SFT MR8804 MR8819']]){
  const p=program([...prefix,'CON','MOV #37 DM8820','OUT MR8821']);
  const d=layoutKeyenceNetwork(buildKeyenceNetworks(p)[0],p,false),block=d.symbols.find(s=>s.ports)!,move=d.symbols.find(s=>s.instruction.opcode==='MOV')!;
  assert.ok(move,'every linked command must be drawn');
  assert.equal(move.y,block.ports![0].y);
  assert.equal(move.x,block.x+block.width);
  assert.equal(move.x+move.width,d.right-8);
  assert.ok(d.wires.some(w=>w.x1===move.x+move.width&&w.x2===d.right&&w.y1===move.y&&w.y2===move.y));
 }
});
