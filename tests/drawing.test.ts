import test from 'node:test';
import assert from 'node:assert/strict';
import { strokeCoordinates } from '../src/drawing.ts';
import { mergeWires, gridLayout, type GridWire } from '../src/layout.ts';
import { buildProgram, parseProgram } from '../src/model.ts';
import { parseComparison } from '../src/comparison.ts';

test('horizontal and vertical stroke edges align at fractional zoom and DPI',()=>{
 for(const zoom of [0.8,1,1.4,1.41,1.5])for(const ratio of [1,1.25,1.5,2])for(const origin of [0,0.2,151.2,386.2]) {
  const c=strokeCoordinates(zoom,ratio,origin,origin,1);
  for(const value of [0,7,28,37,74,148,392])for(const position of [c.x(value),c.y(value)]) {
   const center=(origin+position*zoom)*ratio;
   const half=c.width*zoom*ratio/2;
   for(const edge of [center-half,center+half])assert.ok(Math.abs(edge-Math.round(edge))<1e-7,`${zoom}, ${ratio}, ${origin}, ${value}`);
  }
  assert.equal(Math.round(c.width*c.scale),Math.max(1,Math.round(ratio)));
 }
});
test('overlapping and reversed spans merge without joining parallel wires',()=>{
 assert.deepEqual(mergeWires([
  {x1:0,y1:0,x2:4,y2:0},{x1:6,y1:0,x2:2,y2:0},{x1:6,y1:0,x2:8,y2:0},
  {x1:0,y1:1,x2:4,y2:1},{x1:2,y1:0,x2:2,y2:3},{x1:2,y1:1,x2:2,y2:4}
 ]),[{x1:0,y1:0,x2:8,y2:0},{x1:0,y1:1,x2:4,y2:1},{x1:2,y1:0,x2:2,y2:4}]);
});
function overlap(a:GridWire,b:GridWire){
 const h=a.y1===a.y2&&b.y1===b.y2&&a.y1===b.y1;
 const v=a.x1===a.x2&&b.x1===b.x2&&a.x1===b.x1;
 return h?Math.min(a.x2,b.x2)>Math.max(a.x1,b.x1):v&&Math.min(a.y2,b.y2)>Math.max(a.y1,b.y1);
}
test('synthetic nested branches keep every visible instruction without repeated wire spans',()=>{
 const ops = [
  ['LD','X30'],['LD','X31'],['AND','X32'],['LD','X33'],['AND','X34'],['ORB',''],['ANB',''],
  ['LD','X35'],['ORB',''],['AND','X36'],['MPS',''],['OUT','Y30'],['MPP',''],['AND','X37'],['OUT','Y31'],
  ['LD','X40'],['AND','X41'],['LD','X42'],['OR','X43'],['ANB',''],['MPS',''],['SET','M40'],
  ['MPP',''],['ANI','X44'],['OUT','Y40']
 ];
 const text = [
  'ステップ番号\t命令\tI/O(デバイス)',
  ...ops.map(([op,arg],i)=>[String(i),op,arg].join('\t'))
 ].join('\n');
 const p=parseProgram(text,'synthetic-branches.csv');
 assert.equal(p.networks.length,2);
 assert.deepEqual(p.networks.flatMap(n=>n.warnings),[]);
 for(const n of p.networks) {
  const g=gridLayout(n);
  assert.ok(g.wires.some(w=>w.x1===w.x2&&w.y1!==w.y2),'fixture contains a branch wire');
  for(let i=0;i<g.wires.length;i++)for(let j=i+1;j<g.wires.length;j++)assert.ok(!overlap(g.wires[i],g.wires[j]),n.step);
  for(const instruction of n.instructions.filter(i=>!['MPS','MPP','ANB','ORB'].includes(i.op))) {
   assert.equal(g.symbols.filter(s=>s.instruction.id===instruction.id).length,1,instruction.op+' is drawn once');
  }
 }
});

function placedNetwork(commands:string[]) {
 return buildProgram(commands.map((command,index)=>{
  const [op,...operands]=command.split(' ');
  return {id:`synthetic-${index}`,sourceRow:index+1,step:String(index),op,operands,note:'',statement:''};
 }),'synthetic-placement').networks[0];
}
const sharedParallel=['LD X10','LD X11','OR X12','OR X13','ANB','OUT Y20','OUT T41 K20'];

test('outputs sharing a three-row condition use its first and second rows',()=>{
 const n=placedNetwork(sharedParallel),g=gridLayout(n);
 assert.deepEqual(n.warnings,[]);assert.equal(g.rows,3);
 assert.deepEqual(g.symbols.filter(s=>!s.contact).map(s=>s.row),[0,1]);
 assert.deepEqual(g.symbols.filter(s=>s.contact&&['X11','X12','X13'].includes(s.instruction.operands[0])).map(s=>s.row),[0,1,2]);
 assert.deepEqual(g.symbols.find(s=>s.instruction.operands[0]==='T41')!.instruction.operands,['T41','K20']);
 assert.ok(g.wires.some(w=>w.x1===2&&w.x2===2&&w.y1===0&&w.y2===2),'all three parallel inputs retain their shared junction');
 for(const instruction of n.instructions.filter(i=>i.op!=='ANB'))assert.equal(g.symbols.filter(s=>s.instruction===instruction).length,1);
});

test('an FB reserves its full output height while sharing parallel-condition height',()=>{
 const n=placedNetwork(sharedParallel),fb=n.actions[0].instruction;
 fb.op='FBCALL Synthetic';fb.operands=[];
 fb.pins=Array.from({length:4},(_,index)=>({id:`pin-${index}`,sourceRow:100+index,step:'',op:'Synthetic IN:Value',operands:[`D${index}`],note:'',statement:''}));
 const g=gridLayout(n),outputs=g.symbols.filter(s=>!s.contact);
 assert.deepEqual(outputs.map(s=>s.row),[0,3],'the second output starts after the three-row FB');
 assert.equal(g.rows,4);assert.equal(outputs[0].span,5);assert.equal(outputs[0].instruction.pins,fb.pins);
 assert.deepEqual(g.symbols.filter(s=>s.contact&&s.col===1).map(s=>s.row),[0,1,2]);
});

test('different MPS/MRD conditions clear earlier parallel branches without duplicating shared contacts',()=>{
 const n=placedNetwork(['LD X0','MPS','LD X1','OR X2','OR X3','ANB','OUT Y0','OUT Y1','MRD','LD X4','OR X5','OR X6','ANB','OUT Y2','MPP','AND X7','OUT Y3']);
 const g=gridLayout(n);
 assert.deepEqual(n.warnings,[]);
 assert.deepEqual(g.symbols.filter(s=>!s.contact).map(s=>s.row),[0,1,3,6]);assert.equal(g.rows,7);
 assert.equal(g.symbols.filter(s=>s.instruction.operands[0]==='X0').length,1);
 assert.deepEqual(g.symbols.filter(s=>s.contact&&['X4','X5','X6'].includes(s.instruction.operands[0])).map(s=>s.row),[3,4,5]);
 for(let i=0;i<g.wires.length;i++)for(let j=i+1;j<g.wires.length;j++)assert.ok(!overlap(g.wires[i],g.wires[j]));
});

test('packed outputs retain comparison alignment and do not invent an operand-only wire difference',()=>{
 const source=sharedParallel,target=[...sharedParallel.slice(0,-1),'OUT T41 K21'];
 const csv=[['行','ステップ','照合元','ステップ','照合先','照合結果'],...source.map((command,index)=>[String(index+1),String(index),command,String(index),target[index],'不一致'])]
  .map(row=>row.map(value=>'"'+value.replaceAll('"','""')+'"').join('\t')).join('\n');
 const p=parseComparison(csv,'synthetic-placement-comparison');
 for(const side of [p,p.comparison!.target]){
  const n=side.networks[0],g=gridLayout(n);
  assert.equal(g.rows,3);assert.deepEqual(n.rowAlignment,[0,1,2]);
  assert.deepEqual(g.symbols.filter(s=>!s.contact).map(s=>s.row),[0,1]);
  assert.ok(g.wires.every(w=>!w.difference));assert.deepEqual(n.connectionDifferences!.wires,[]);
  const original=JSON.stringify(g);
  n.rowAlignment=[0,2,3];
  n.connectionDifferences={kind:'removed',wires:[0],inputs:[n.actions[1].instruction.id],outputs:[]};
  const padded=gridLayout(n);
  assert.equal(padded.rows,4);assert.deepEqual(padded.symbols.filter(s=>!s.contact).map(s=>s.row),[0,2]);
  assert.equal(padded.wires[0].difference,'removed');
  for(let index=0;index<g.wires.length;index++){
   assert.equal(padded.wires[index].x1,g.wires[index].x1);assert.equal(padded.wires[index].x2,g.wires[index].x2);
   assert.equal(padded.wires[index].y1,n.rowAlignment[g.wires[index].y1]);assert.equal(padded.wires[index].y2,n.rowAlignment[g.wires[index].y2]);
  }
  assert.equal(JSON.stringify(g),original,'the earlier grid result is not mutated');
 }
});

test('an inserted shared output keeps the existing timer aligned and branch input connections unchanged',()=>{
 const source=sharedParallel,target=[...source.slice(0,-1),'OUT M999',source.at(-1)!];
 const csv=[['行','ステップ','照合元','ステップ','照合先','照合結果'],...target.map((command,index)=>[String(index+1),source[index]?String(index):'',source[index]??'',String(index),command,'不一致'])]
  .map(row=>row.map(value=>'"'+value.replaceAll('"','""')+'"').join('\t')).join('\n');
 const p=parseComparison(csv,'synthetic-shared-output-insertion');
 assert.deepEqual(p.comparison!.changes.map(change=>change.kind),['added']);
 const grids=[p,p.comparison!.target].map(side=>{
  const n=side.networks[0],g=gridLayout(n);
  assert.deepEqual(n.warnings,[]);
  assert.ok(g.symbols.filter(s=>s.contact).every(s=>!s.inputDifference),'inserting a shared output does not alter the branch input net');
  assert.ok(n.connectionDifferences!.wires.every(index=>index>=0&&index<g.wires.length));
  assert.ok(n.rowAlignment!.every((row,index,all)=>index===0||row>all[index-1]));
  return g;
 });
 const timerRow=(g:ReturnType<typeof gridLayout>)=>g.symbols.find(s=>!s.contact&&s.instruction.operands[0]==='T41')!.row;
 assert.equal(timerRow(grids[0]),timerRow(grids[1]));
});
