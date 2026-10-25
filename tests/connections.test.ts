import test from 'node:test';
import assert from 'node:assert/strict';
import {parseComparison} from '../src/comparison.ts';
import {gridLayout} from '../src/layout.ts';
import type {Program} from '../src/model.ts';
const csv=(source:string[],target:string[])=>[
 ['行','ステップ','照合元','ステップ','照合先','照合結果'],
 ...Array.from({length:Math.max(source.length,target.length)},(_,i)=>[String(i+1),source[i]?String(i):'',source[i]??'',target[i]?String(i):'',target[i]??'','不一致'])
].map(row=>row.map(value=>'"'+value.replaceAll('"','""')+'"').join('\t')).join('\n');
const marked=(program:Program)=>program.networks.flatMap(n=>gridLayout(n).wires.filter(w=>w.difference));

test('a shared OR merge removed from the output conditions marks its actual junction wires',()=>{
 const source=['LDI B400','LD Y0E1','MEP','ORB','OUT X71','SET X0A8'];
 const target=['LDI B400','OUT X71','LD Y0E1','MEP','SET X0A8'];
 const p=parseComparison(csv(source,target),'branch');
 const g=gridLayout(p.networks[0]);
 const vertical=g.wires.find(w=>w.x1===2&&w.x2===2&&w.y1!==w.y2);
 assert.equal(vertical?.difference,'removed');
 assert.ok(g.wires.some(w=>w.x1===2&&w.x2===10&&w.difference==='removed'));
 assert.ok(marked(p.comparison!.target).some(w=>w.difference==='added'));
 for(const side of [p,p.comparison!.target]){
  const edge=side.networks.flatMap(n=>gridLayout(n).symbols).find(s=>s.instruction.op==='MEP')!;
  assert.equal(edge.inputDifference,undefined,'Y0E1 to MEP remains the same direct connection');
 }
});

test('insertion and row padding do not color unchanged existing branch connections',()=>{
 const a=['LD X0','MPS','AND X1','OUT Y1','MPP','AND X2','OUT Y2'];
 const b=['LD X0','MPS','AND X1','OUT Y1','MRD','AND X9','OUT Y9','MPP','AND X2','OUT Y2'];
 const p=parseComparison(csv(a,b),'insert');
 // Adding a branch to the shared X0 output changes that junction, but the existing AND-to-OUT paths remain unchanged.
 for(const side of [p,p.comparison!.target])for(const symbol of side.networks.flatMap(n=>gridLayout(n).symbols).filter(s=>s.instruction.op==='OUT'&&['Y1','Y2'].includes(s.instruction.operands[0])))assert.equal(symbol.inputDifference,undefined);
});

test('steps, layout gaps and operand-only edits do not invent a connection change',()=>{
 const p=parseComparison(csv(['LD X0','AND X1','OUT Y0'],['LD X0','AND X2','OUT Y0']),'operand');
 assert.equal(marked(p).length,0);assert.equal(marked(p.comparison!.target).length,0);
 const same=parseComparison(csv(['LD X0','OUT Y0','LD X1','OUT Y1'],['LD X9','OUT Y9','LD X0','OUT Y0','LD X1','OUT Y1']),'gap');
 assert.equal(marked(same).length,0);
 for(const symbol of same.networks.flatMap(n=>gridLayout(n).symbols))assert.ok(!symbol.inputDifference&&!symbol.outputDifference);
});

test('a new independent rung colors its branch, not the existing mother rail terminals',()=>{
 const p=parseComparison(csv(['LD X0','OUT Y0'],['LD X0','OUT Y0','LD X9','OUT Y9']),'new');
 const existing=gridLayout(p.comparison!.target.networks[0]);
 assert.ok(existing.symbols.every(s=>!s.inputDifference&&!s.outputDifference));assert.ok(existing.wires.every(w=>!w.difference));
 const added=gridLayout(p.comparison!.target.networks[1]);
 assert.ok(added.wires.some(w=>w.difference==='added'));
 assert.equal(added.symbols.find(s=>s.instruction.op==='LD')?.inputDifference,'added');
});