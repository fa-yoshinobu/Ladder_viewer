import test from 'node:test';
import assert from 'node:assert/strict';
import {parseComparison} from '../src/comparison.ts';
import {gridLayout,ROW} from '../src/layout.ts';
import {comparisonDisplayProgram} from '../src/comparisonDisplay.ts';
import {instructionDrawingOffset} from '../src/NetworkDrawing.tsx';
import {compareConnectionGraphs} from '../src/connectionGraph.ts';
import {parseKeyenceMnm} from '../src/keyence/parser.ts';
import {compareKeyencePrograms,keyenceComparisonDrawings} from '../src/keyence/comparison.ts';
import {keyenceCompareDrawing} from '../src/keyence/compareDrawing.tsx';

// Original synthetic circuits; no user CSV or device list is stored in tests.
const resetSource=['LD X0','AND X1','OR M0','ANI X2','AND X3','MPS','ANI M0','RST M10','RST M11','MPP','OUT M0'];
const resetTarget=(count:number)=>['LD X0',...Array.from({length:count},(_,i)=>`OR X${90+i}`),'AND X1','OR M0','AND X3','AND M1','OUT M0'];
const compareSource=['LD X0','MPS','LDD< K10 D0','ANDD< D0 K20','LDD< K30 D0','ANDD< D0 K40','ORB',
 'LDD< K50 D0','ANDD< D0 K60','ORB','OR M10','LD X10','ORI X11','LD X12','AND X13','ORB','ANB','OR X14','ANB','OUT M20','MPP','OUT M21','OUT M22'];
const compareTarget=compareSource.filter(c=>c!=='ORI X11');
const csv=(a:string[],b:string[])=>[['行','ステップ','照合元','ステップ','照合先','照合結果'],
 ...Array.from({length:Math.max(a.length,b.length)},(_,i)=>[String(i+1),a[i]?String(i):'',a[i]??'',b[i]?String(i):'',b[i]??'','不一致'])]
 .map(row=>row.map(v=>'"'+v+'"').join('\t')).join('\n');
const keyence=(commands:string[])=>commands.map(command=>{
 const [op,...operands]=command.split(' ');
 const opcode=({ANB:'ANL',ORB:'ORL',ANI:'ANB',ORI:'ORB','LDD<':'LD<.D','ANDD<':'AND<.D'} as Record<string,string>)[op]??op;
 return [opcode,...operands.map(o=>o.replace(/^X/,'R').replace(/^M/,'MR').replace(/^D/,'DM').replace(/^K/,'#'))].join(' ');
});
const mnm=(commands:string[])=>parseKeyenceMnm(new TextEncoder().encode(['DEVICE:99',...keyence(commands)].join('\n')).buffer,'synthetic-branches.mnm');
interface SymbolRow {id:string;command:string;row:number;x:number;width:number;contact:boolean;inputDifference?:string;outputDifference?:string}
interface Drawing {symbols:SymbolRow[];wires:{x1:number;y1:number;x2:number;y2:number}[];railX:number}
const graph=(d:Drawing)=>({...d,terminals:d.symbols.flatMap(s=>[
 {x:s.x,y:s.row,key:s.id+':in',instruction:s.id,input:true},
 ...s.contact?[{x:s.x+s.width,y:s.row,key:s.id+':out',instruction:s.id,input:false}]:[]])});
function unchangedConnections(a:Drawing,b:Drawing){
 for(const side of compareConnectionGraphs([graph(a)],[graph(b)]))assert.deepEqual(side.map(({wires,inputs,outputs})=>({wires,inputs,outputs})),[{wires:[],inputs:[],outputs:[]}]);
 assert.deepEqual(a.symbols.map(s=>[s.id,s.inputDifference,s.outputDifference]),b.symbols.map(s=>[s.id,s.inputDifference,s.outputDifference]));
 for(const s of b.symbols.filter(s=>s.contact))assert.ok(!b.wires.some(w=>w.y1===s.row&&w.y2===s.row&&Math.min(w.x1,w.x2)<s.x+s.width&&Math.max(w.x1,w.x2)>s.x),'alignment does not short a contact');
}

for(const vendor of ['Mitsubishi','KEYENCE'] as const){
 const command=(value:string)=>vendor==='KEYENCE'?keyence([value])[0]:value;
 const inspect=(source:string[],target:string[])=>{
  if(vendor==='Mitsubishi'){
   const p=parseComparison(csv(source,target),'synthetic-branches');
   const drawing=(g:ReturnType<typeof gridLayout>):Drawing=>({railX:0,wires:g.wires,symbols:g.symbols.map(s=>({id:s.instruction.id,command:[s.instruction.op,...s.instruction.operands].join(' '),row:s.row,x:s.col,width:s.span,contact:s.contact,inputDifference:s.inputDifference,outputDifference:s.outputDifference}))});
   return [p,p.comparison!.target].map((side,index)=>{
    const n=side.networks[0],g=gridLayout(n),natural=gridLayout(comparisonDisplayProgram(p,index?'target':'source').networks[0]);
    for(const s of g.symbols)assert.equal(instructionDrawingOffset(n,s.instruction.id,ROW,1,'wrap'),s.row*ROW);
    return {aligned:drawing(g),natural:drawing(natural)};
   });
  }
  const comparison=compareKeyencePrograms(mnm(source),mnm(target));
  const aligned=keyenceComparisonDrawings(comparison,false,'scroll')[0],natural=keyenceComparisonDrawings(comparison,false,'scroll',false)[0];
  const blocks=keyenceCompareDrawing(comparison,false,1,'scroll','both')[0];
  return (['source','target'] as const).map(side=>{
   const drawing=(d:typeof aligned.source[number]):Drawing=>({railX:d.left,wires:d.wires.map(w=>({...w,y1:(w.y1-d.headerHeight-d.baseline)/d.rowHeight,y2:(w.y2-d.headerHeight-d.baseline)/d.rowHeight})),
    symbols:d.symbols.map(s=>({id:s.instruction.id,command:[s.instruction.opcode,...s.instruction.operands].join(' '),row:(s.y-d.headerHeight-d.baseline)/d.rowHeight,x:s.x,width:s.width,contact:['contact','comparison','inline'].includes(s.kind),inputDifference:s.inputDifference,outputDifference:s.outputDifference}))});
   for(const s of aligned[side][0].symbols)assert.equal(blocks[side][0].locations!.find(l=>l.id===s.instruction.id)!.y,s.y-aligned[side][0].baseline);
   return {aligned:drawing(aligned[side][0]),natural:drawing(natural[side][0])};
  });
 };
 test(`${vendor} inserted input branches do not add gaps between independent reset outputs`,()=>{
  for(const count of [1,3])for(const reverse of [false,true]){
   const sides=inspect(...(reverse?[resetTarget(count),resetSource]:[resetSource,resetTarget(count)]) as [string[],string[]]);
   const reset=sides[reverse?1:0].aligned;
   assert.deepEqual(reset.symbols.filter(s=>s.command.startsWith('RST ')).map(s=>s.row),[0,1]);
   for(const side of sides){
    assert.equal(side.aligned.symbols.find(s=>s.command===command('OR M0'))!.row,count+1);
    unchangedConnections(side.natural,side.aligned);
   }
  }
 });
 test(`${vendor} a changed parallel block aligns without moving the neighboring comparison branches`,()=>{
  for(const reverse of [false,true]){
   const sides=inspect(...(reverse?[compareTarget,compareSource]:[compareSource,compareTarget]) as [string[],string[]]);
   for(const side of sides){
    assert.deepEqual(side.aligned.symbols.filter(s=>s.command.includes('<')).map(s=>s.row),[0,0,1,1,2,2]);
    for(const c of ['LD X12','AND X13'])assert.equal(side.aligned.symbols.find(s=>s.command===command(c))!.row,2);
    assert.equal(side.aligned.symbols.find(s=>s.command===command('OR M10'))!.row,3);
    unchangedConnections(side.natural,side.aligned);
   }
  }
 });
}
