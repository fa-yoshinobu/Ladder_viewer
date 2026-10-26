import {diffArrays} from 'diff';
import {alignInstructions,commandKey,pairAlignedNetworks,type ChangeKind} from '../compareCore';
import {compareConnectionGraphs,type ConnectionTerminal} from '../connectionGraph';
import {buildKeyenceNetworks,type KeyenceNetwork} from './logic';
import {keyenceInstructionComment,layoutKeyenceNetwork,keyenceViewDrawing,type KeyenceDrawing} from './layout';
import type {KeyenceProgram,KeyenceInstruction} from './model';
export interface KeyenceChange {row:number;kind:ChangeKind;source?:KeyenceInstruction;target?:KeyenceInstruction;}
export interface KeyenceComparison {source:KeyenceProgram;target:KeyenceProgram;groups:{source:KeyenceNetwork[];target:KeyenceNetwork[];changes:KeyenceChange[]}[];changes:KeyenceChange[];}
export function compareKeyencePrograms(sourceInput:KeyenceProgram,targetInput:KeyenceProgram):KeyenceComparison {
 const source=structuredClone(sourceInput),target=structuredClone(targetInput),a=buildKeyenceNetworks(source),b=buildKeyenceNetworks(target);
 const describe=(networks:KeyenceNetwork[],p:KeyenceProgram)=>networks.map(n=>{
  const actions=new Set(n.actions.flatMap(a=>[a.instruction,...a.continuations??[]]).map(i=>i.id)),conditions=new Set<string>();
  const visit=(e:KeyenceNetwork['condition'])=>{if(!e)return;if(e.kind==='contact')conditions.add(e.instruction.id);else if(e.kind==='unary'){conditions.add(e.instruction.id);visit(e.input);}else{visit(e.left);visit(e.right);}};
  for(const action of n.actions){visit(action.condition);visit(action.resetCondition??null);}visit(n.condition);
  return n.instructions.map(i=>({id:i.id,opcode:i.opcode,operands:i.operands,line:i.sourceLine,
   role:actions.has(i.id)?'action' as const:conditions.has(i.id)?'condition' as const:'structure' as const,
   family:i.opcode==='ANL'||i.opcode==='ORL'?'block-join':i.opcode,
   annotation:JSON.stringify([i.statement,keyenceInstructionComment(i,p)])}));
 });
 const sources=new Map(source.instructions.map(i=>[i.id,i])),targets=new Map(target.instructions.map(i=>[i.id,i])),changes:KeyenceChange[]=[];
 alignInstructions(describe(a,source),describe(b,target)).forEach((pair,index)=>{
  const row=index+1,left=pair.source&&sources.get(pair.source.id),right=pair.target&&targets.get(pair.target.id);
  if(left)left.comparisonRow=row;if(right)right.comparisonRow=row;
  if(pair.source&&pair.target&&commandKey(pair.source)===commandKey(pair.target)&&pair.source.annotation===pair.target.annotation)return;
  const kind=!left?'added':!right?'removed':'changed';changes.push({row,kind,source:left,target:right});
  for(const [own,other] of [[left,right],[right,left]])if(own)own.difference={kind,opChanged:kind==='changed'&&own.opcode!==other?.opcode,
   operandChanges:kind==='changed'?own.operands.flatMap((v,index)=>v!==other?.operands[index]?[index]:[]):[],otherText:other?[other.opcode,...other.operands].join(' '):'',otherLine:other?.sourceLine};
 });
 const groups=pairAlignedNetworks(a,b).map(group=>{const rows=new Set([...group.source,...group.target].flatMap(n=>n.instructions.map(i=>i.comparisonRow)));return {...group,changes:changes.filter(c=>rows.has(c.row))};});
 return {source,target,groups,changes};
}
function terminals(drawing:KeyenceDrawing):ConnectionTerminal[]{
 const result:ConnectionTerminal[]=[],continuing=new Set(drawing.network.actions.flatMap(a=>[a.instruction,...a.continuations??[]].slice(0,-1).map(i=>i.id)));
 for(const s of drawing.symbols){
  const key=s.instruction.comparisonRow??s.instruction.id;
  if(s.ports)for(const port of s.ports)result.push({x:s.x,y:port.y,key:`${key}:${port.name}`,instruction:`${s.instruction.id}:${port.name}`,input:true});
  else result.push({x:s.x,y:s.y,key:`${key}:in`,instruction:s.instruction.id,input:true});
  if(['contact','comparison','inline'].includes(s.kind)||continuing.has(s.instruction.id))result.push({x:s.x+s.width,y:s.y,key:`${key}:out`,instruction:s.instruction.id,input:false});
 }
 return result;
}
function alignRows(drawings:[KeyenceDrawing[],KeyenceDrawing[]]):[KeyenceDrawing[],KeyenceDrawing[]]{
 if(!drawings[0].length||!drawings[1].length)return drawings;
 const rows=drawings.map(side=>side.flatMap(d=>Array.from({length:d.rows},(_,row)=>({drawing:d,row,
  key:Math.max(0,...d.symbols.filter(s=>Math.round((s.y-d.headerHeight-d.baseline)/d.rowHeight)===row).map(s=>s.instruction.comparisonRow??0))}))));
 const positions:[number[],number[]]=[[],[]];let slot=0;
 const chunks=diffArrays(rows[0].map(r=>r.key),rows[1].map(r=>r.key));
 for(let index=0;index<chunks.length;index++){
  const part=chunks[index];if(!part.added&&!part.removed){for(let n=0;n<part.count;n++){positions[0].push(slot);positions[1].push(slot++);}continue;}
  let removed=0,added=0;while(index<chunks.length&&(chunks[index].added||chunks[index].removed)){if(chunks[index].removed)removed+=chunks[index].count;else added+=chunks[index].count;index++;}index--;
  for(let n=0;n<removed;n++)positions[0].push(slot+n);for(let n=0;n<added;n++)positions[1].push(slot+n);slot+=Math.max(removed,added);
 }
 const rowHeight=Math.max(...drawings.flat().map(d=>d.rowHeight)),headers=Array<number>(slot).fill(0),tops:number[]=[];
 // A statement between two circuits also needs space on the opposite, merged circuit.
 rows.forEach((side,index)=>side.forEach((r,row)=>{if(r.row===0){const at=positions[index][row];headers[at]=Math.max(headers[at],r.drawing.headerHeight);}}));
 let top=0;for(const header of headers){top+=header;tops.push(top);top+=rowHeight;}
 return drawings.map((side,index)=>{
  let rowIndex=0,end=0;
  return side.map(d=>{
   const slots=positions[index].slice(rowIndex,rowIndex+d.rows);rowIndex+=d.rows;
   const start=end,headerHeight=tops[slots[0]]-start;
   end=tops[slots.at(-1)!]+rowHeight;
   const y=(value:number)=>{const row=Math.round((value-d.headerHeight-d.baseline)/d.rowHeight);return tops[slots[row]]+d.baseline-start;};
   return {...d,rowHeight,headerHeight,rows:slots.at(-1)!-slots[0]+1,height:end-start,railTop:headerHeight,railBottom:end-start,
    symbols:d.symbols.map(s=>({...s,y:y(s.y),ports:s.ports?.map(p=>({...p,y:y(p.y)}))})),wires:d.wires.map(w=>({...w,y1:y(w.y1),y2:y(w.y2)}))};
  });
 }) as [KeyenceDrawing[],KeyenceDrawing[]];
}
export function keyenceComparisonDrawings(comparison:KeyenceComparison,showComments:boolean,viewMode:'wrap'|'scroll',align=true){
 return comparison.groups.map(group=>{
  let drawings:[KeyenceDrawing[],KeyenceDrawing[]]=[group.source.map(n=>layoutKeyenceNetwork(n,comparison.source,showComments,viewMode==='wrap')),
   group.target.map(n=>layoutKeyenceNetwork(n,comparison.target,showComments,viewMode==='wrap'))];
  const diff=compareConnectionGraphs(...drawings.map(side=>side.map(d=>({wires:d.wires,terminals:terminals(d),railX:d.left}))) as [Parameters<typeof compareConnectionGraphs>[0],Parameters<typeof compareConnectionGraphs>[1]]);
  for(let side=0;side<2;side++)for(const [index,d] of drawings[side].entries()){
   const changes=diff[side][index],inputs=new Set(changes.inputs),outputs=new Set(changes.outputs),wireIndices=new Set(changes.wires);
   d.wires=d.wires.map((w,index)=>({...w,difference:wireIndices.has(index)?changes.kind:undefined}));
   d.symbols=d.symbols.map(s=>({...s,inputDifference:inputs.has(s.instruction.id)?changes.kind:undefined,outputDifference:outputs.has(s.instruction.id)?changes.kind:undefined,
    ports:s.ports?.map(p=>({...p,difference:inputs.has(`${s.instruction.id}:${p.name}`)?changes.kind:undefined}))}));
  }
  if(align)drawings=alignRows(drawings);
  return {source:drawings[0].map(d=>keyenceViewDrawing(d,viewMode)),target:drawings[1].map(d=>keyenceViewDrawing(d,viewMode)),changes:group.changes};
 });
}
