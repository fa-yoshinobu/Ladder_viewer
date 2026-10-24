import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { strokeCoordinates } from '../src/drawing.ts';
import { mergeWires, gridLayout, type GridWire } from '../src/layout.ts';
import { decodeCsv, parseProgram } from '../src/model.ts';

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
test('the reported STEP1152/1165 circuits keep every instruction and have no repeated wire spans',()=>{
 const bytes=readFileSync(new URL('../public/重量測定部.csv',import.meta.url));
 const p=parseProgram(decodeCsv(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),'重量測定部.csv');
 for(const step of ['1152','1165']) {
  const n=p.networks.find(n=>n.step===step)!;assert.ok(n);
  const g=gridLayout(n);
  for(let i=0;i<g.wires.length;i++)for(let j=i+1;j<g.wires.length;j++)assert.ok(!overlap(g.wires[i],g.wires[j]),step);
  for(const action of n.actions)assert.equal(g.symbols.filter(s=>s.instruction.id===action.instruction.id).length,1);
 }
});
