import {placeSymbolColumn} from './ladderGeometry';
import {CELL,ROW,COLUMNS,GRID_WIDTH,LEFT_GUTTER,LADDER_WIDTH,BASELINE,PAGE_GAP} from './ladderMetrics';
export {CELL,ROW,COMMENT_ROW,COLUMNS,GRID_WIDTH,LEFT_GUTTER,LADDER_WIDTH,BASELINE,PAGE_GAP,SCROLLBAR_HEIGHT} from './ladderMetrics';
import type { Instruction, Logic, Network } from './model';
import type {FunctionBlock,FunctionPort} from './functionBlocks';
import { isComparisonCondition } from './instructions';
import { isControlMarker, isMemoryControl } from './controlFlow';
export const isCoil = (i:Instruction) => /^(OUT|OUTH)$/.test(i.op) && i.operands.length===1;
export function fitLadderZoom(viewportWidth:number,comparison:boolean):number {
 const availableWidth=comparison?(viewportWidth-170)/2:viewportWidth;
 return Math.max(comparison ? .25 : .5,Math.min(1.5,Math.floor((availableWidth-24)/LADDER_WIDTH*100)/100));
}
export type LadderViewMode = 'wrap' | 'scroll';
export interface GridSymbol { instruction: Instruction; col: number; row: number; span: number; contact: boolean; value?:string; valueEnd?:boolean; fb?:{model:FunctionBlock;rows:number;ports:{port:FunctionPort;row:number;input:boolean}[]}; inputDifference?:'added'|'removed'; outputDifference?:'added'|'removed'; }
export interface GridWire { x1: number; y1: number; x2: number; y2: number; difference?:'added'|'removed'; }
export interface GridLayout { symbols: GridSymbol[]; wires: GridWire[]; rows: number; pages: number; width: number; height: number; }
export function inlineSTLines(instruction:Instruction,span=8):string[] {
 const limit=Math.floor((span*CELL-28)/7.2),lines:string[]=[];
 for(const source of (instruction.inlineST?.text??'').split(/\r\n?|\n/)){
  let text='',units=0;
  for(const c of source){const width=c.charCodeAt(0)>255?2:1;if(units+width>limit){lines.push(text);text='';units=0;}text+=c;units+=width;}
  lines.push(text);
 }
 return lines;
}
export const inlineSTHeight=(instruction:Instruction,span=8)=>38+inlineSTLines(instruction,span).length*18;
export function size(logic: Logic | null): { width: number; height: number } {
 if(!logic) return {width:0,height:1};
 if(logic.kind==='contact') return {width:isComparisonCondition(logic.instruction.op)||logic.instruction.op==='PHASE'?1+logic.instruction.operands.length:1,height:1};
 const s=logic.children.map(size);
 return logic.kind==='and'?{width:s.reduce((n,c)=>n+c.width,0),height:Math.max(...s.map(c=>c.height))}:{width:Math.max(...s.map(c=>c.width)),height:s.reduce((n,c)=>n+c.height,0)};
}
export function mergeWires(wires: readonly GridWire[]): GridWire[] {
 const groups=new Map<string,{horizontal:boolean;fixed:number;spans:[number,number][]}>();
 for(const w of wires) {
  const horizontal=w.y1===w.y2;
  if(!horizontal&&w.x1!==w.x2)throw new Error('Expected an orthogonal wire');
  const fixed=horizontal?w.y1:w.x1;
  const a=horizontal?w.x1:w.y1,b=horizontal?w.x2:w.y2;
  if(a===b)continue;
  const key=`${horizontal?'h':'v'}:${fixed}`;
  let group=groups.get(key);
  if(!group){group={horizontal,fixed,spans:[]};groups.set(key,group);}
  group.spans.push([Math.min(a,b),Math.max(a,b)]);
 }
 const merged:GridWire[]=[];
 for(const {horizontal,fixed,spans} of groups.values()) {
  spans.sort((a,b)=>a[0]-b[0]);
  const add=(a:number,b:number)=>merged.push(horizontal?{x1:a,y1:fixed,x2:b,y2:fixed}:{x1:fixed,y1:a,x2:fixed,y2:b});
  let [start,end]=spans[0];
  for(const [a,b] of spans.slice(1)) {
   if(a<=end)end=Math.max(end,b);
   else {add(start,end);start=a;end=b;}
  }
  add(start,end);
 }
 return merged;
}
const cache = new WeakMap<Network,GridLayout>();
export function gridLayout(n: Network): GridLayout {
 const existing=cache.get(n); if(existing) return alignedGrid(n,existing);
 const symbols:GridSymbol[]=[]; const wires:GridWire[]=[];
 type End={col:number;row:number;bottom:number};
 const placed=new WeakMap<Logic,End>();
 const line=(x1:number,y1:number,x2:number,y2:number)=>{if(x1!==x2||y1!==y2)wires.push({x1,y1,x2,y2});};
 const route=(a:End,col:number,row:number)=>{line(a.col,a.row,a.col,row);line(a.col,row,col,row);};
 function place(e:Logic,x:number,y:number):End {
  const known=placed.get(e); if(known) return known;
  let end:End;
  if(e.kind==='contact') {
   const span=size(e).width;
   const start=placeSymbolColumn(x,span,COLUMNS);
   line(x,y,start,y);symbols.push({instruction:e.instruction,col:start,row:y,span,contact:true}); end={col:start+span,row:y,bottom:y};
  } else if(e.kind==='and') {
   const a=place(e.children[0],x,y); const b=place(e.children[1],a.col,y); route(a,a.col,y); end={...b,bottom:Math.max(a.bottom,b.bottom)};
  } else {
   const a=place(e.children[0],x,y); const b=place(e.children[1],x,Math.max(y+1,a.bottom+1));
   const col=Math.max(a.col,b.col); line(x,y,x,b.row); route(a,col,a.row); route(b,col,b.row);line(col,a.row,col,b.row);
   end={col,row:a.row,bottom:Math.max(a.bottom,b.bottom)};
  }
  placed.set(e,end);return end;
 }
 if(n.functionBlock){
  const fb=n.functionBlock,ports:NonNullable<GridSymbol['fb']>['ports']=[];let row=1;
  const always=(condition:Logic|null)=>condition?.kind==='contact'&&condition.instruction.op==='LD'&&condition.instruction.operands[0]==='TRUE';
  for(let index=0;index<Math.max(fb.inputs.length,fb.outputs.length);index++){
   const input=fb.inputs[index],output=fb.outputs[index];let bottom=row;
   if(input){
    ports.push({port:input,row,input:true});
    if(input.action){const action=input.action,i=action.instruction;
     const end=action.condition&&!always(action.condition)?place(action.condition,0,row):{col:0,row,bottom:row};
     if(i.op==='MOV'){route(end,3,row);symbols.push({instruction:i,col:3,row,span:1,contact:false,value:i.operands[0],valueEnd:true});}
     else route(end,4,row);
     bottom=Math.max(bottom,end.bottom);
    }
   }
   if(output){
    ports.push({port:output,row,input:false});
    if(output.action){const i=output.action.instruction,span=i.op==='MOV'?5:isCoil(i)?1:1+i.operands.length,col=COLUMNS-span;
     line(7,row,col,row);symbols.push({instruction:i,col,row,span,contact:false,value:i.op==='MOV'?i.operands[1]:undefined});
    }
   }
   row=bottom+1;
  }
  symbols.unshift({instruction:fb.call,col:4,row:0,span:3,contact:false,fb:{model:fb,ports,rows:row}});
  const result={symbols,wires:mergeWires(wires),rows:row,pages:1,width:LADDER_WIDTH,height:row*ROW};cache.set(n,result);return alignedGrid(n,result);
 }
 let nextRow=n.masterControl?1:0,occupiedRows=nextRow;let maxCol=COLUMNS;
 let previousCondition:Logic|null|undefined;
 for(const action of n.actions) {
  // Shared outputs can use branch rows; a new condition must clear all occupied rows.
  const startRow=action.condition===previousCondition?nextRow:Math.max(nextRow,occupiedRows);
  const end=action.condition?place(action.condition,0,startRow):{col:0,row:startRow,bottom:startRow};
  const i=action.instruction;
  const coil=isCoil(i),marker=isControlMarker(i.op);
  const span=marker?Math.max(4,1+i.operands.length):i.inlineST?8:i.pins?5:coil?1:Math.max(1,1+i.operands.length);
  const target=marker&&!action.condition?0:Math.ceil((end.col+span)/COLUMNS)*COLUMNS-span;
  if(i.op!=='NOP'&&!isMemoryControl(i.op)&&(!marker||action.condition))route(end,target,startRow);
  symbols.push({instruction:i,col:target,row:startRow,span,contact:false});
  maxCol=Math.max(maxCol,target+span);
  nextRow=startRow+(i.inlineST?Math.ceil((inlineSTHeight(i,span)+10)/ROW):i.pins ? Math.ceil((i.pins.length*22+66)/ROW) : 1);
  occupiedRows=Math.max(occupiedRows,end.bottom+1,nextRow);
  previousCondition=action.condition;
 }
 if(!n.actions.length&&n.evaluation) {
  const end=place(n.evaluation,0,nextRow);nextRow=end.bottom+1;occupiedRows=Math.max(occupiedRows,nextRow);
 } else if(!n.actions.length)for(const i of n.instructions.filter(i=>i!==n.pointer&&i.op!=='PHASERST')) {symbols.push({instruction:i,col:0,row:nextRow++,span:1+i.operands.length,contact:false});}
 const rows=Math.max(1,nextRow,occupiedRows);const pages=Math.ceil(maxCol/COLUMNS);
 const result={symbols,wires:mergeWires(wires),rows,pages,width:LADDER_WIDTH,height:pages*rows*ROW+(pages>1 ? pages*PAGE_GAP : 0)};cache.set(n,result);return alignedGrid(n,result);
}
function compactColumns(g:GridLayout) {
 const contactEnd=g.symbols.reduce((end,s)=>s.contact?Math.max(end,s.col+s.span):end,0);
 const actionSpan=g.symbols.reduce((span,s)=>s.contact?span:Math.max(span,s.span),0);
 return Math.max(COLUMNS,contactEnd+actionSpan);
}
function compactHorizontalGaps(g:GridLayout):GridLayout {
 const spans=g.symbols.map(s=>({start:s.col,end:s.col+s.span})).sort((a,b)=>a.start-b.start);
 const gaps:{start:number;end:number}[]=[];
 let end=0;
 for(const span of spans){
  if(span.start>end)gaps.push({start:end,end:span.start});
  end=Math.max(end,span.end);
 }
 const horizontal=g.wires.filter(w=>w.y1===w.y2),vertical=g.wires.filter(w=>w.y1!==w.y2);
 const rows=new Set([...g.symbols.map(s=>s.row),...horizontal.map(w=>w.y1)]);
 const removable=gaps.filter(({start,end})=>{
  // Keep junctions and disconnected terminals apart when collapsing a whole empty strip.
  if(vertical.some(w=>start<=w.x1&&w.x1<=end))return false;
  if(horizontal.some(w=>start<w.x1&&w.x1<end||start<w.x2&&w.x2<end))return false;
  for(const row of rows){
   const terminals=g.symbols.filter(s=>s.row===row),wires=horizontal.filter(w=>w.y1===row);
   const present=(x:number)=>terminals.some(s=>s.col===x||s.col+s.span===x)||wires.some(w=>Math.min(w.x1,w.x2)<=x&&x<=Math.max(w.x1,w.x2));
   if(present(start)&&present(end)&&!wires.some(w=>Math.min(w.x1,w.x2)<=start&&Math.max(w.x1,w.x2)>=end))return false;
  }
  return true;
 });
 if(!removable.length)return g;
 const column=(x:number)=>x-removable.reduce((sum,gap)=>sum+Math.max(0,Math.min(x,gap.end)-gap.start),0);
 const removed=removable.reduce((sum,gap)=>sum+gap.end-gap.start,0);
 return {...g,width:g.width-removed*CELL,symbols:g.symbols.map(s=>({...s,col:column(s.col)})),wires:g.wires.map(w=>({...w,x1:column(w.x1),x2:column(w.x2)}))};
}
export function displayGrid(network:Network,viewMode:LadderViewMode='wrap'):GridLayout {
 const g=gridLayout(network);
 if(viewMode!=='scroll'||g.pages===1)return g;
 const right=Math.max(compactColumns(g),...g.symbols.filter(s=>isControlMarker(s.instruction.op)).map(s=>s.col+s.span)),key=(col:number,row:number)=>`${col}:${row}`;
 const terminals=new Set<string>(),horizontalEnds=new Map<string,number>(),verticals=new Map<number,GridWire[]>();
 for(const s of g.symbols)if(s.contact){terminals.add(key(s.col,s.row));terminals.add(key(s.col+s.span,s.row));}
 g.wires.forEach((w,index)=>{
  if(w.y1===w.y2)horizontalEnds.set(key(w.x2,w.y2),index);
  else {const column=verticals.get(w.x1)??[];column.push(w);verticals.set(w.x1,column);}
 });
 const wires=g.wires.map(w=>({...w}));
 const symbols=g.symbols.map(s=>{
  if(s.contact||isControlMarker(s.instruction.op))return s;
  const col=right-s.span;
  if(col!==s.col){
   const junction=terminals.has(key(s.col,s.row))||(verticals.get(s.col)??[]).some(w=>Math.min(w.y1,w.y2)<=s.row&&s.row<=Math.max(w.y1,w.y2));
   const index=horizontalEnds.get(key(s.col,s.row));
   if(!junction&&index!==undefined&&wires[index].x1<=col)wires[index].x2=col;
   else wires.push({x1:s.col,y1:s.row,x2:col,y2:s.row,difference:s.inputDifference});
  }
  return {...s,col};
 });
 return compactHorizontalGaps({...g,symbols,wires,width:LEFT_GUTTER+right*CELL+16});
}
export const NOTE_LINE_HEIGHT = 18;
export interface GridNote {
 owner:Instruction; instructions:Instruction[]; row:number; col:number; span:number; pointer:boolean; top:number; lines:string[];
}
export function noteLayout(network:Network,viewMode:LadderViewMode='wrap'):GridNote[] {
 const grid=displayGrid(network,viewMode),notes=new Map<string,GridNote>(),owners=new Map<string,GridSymbol>();
 for(const symbol of grid.symbols){
  owners.set(symbol.instruction.id,symbol);
  for(const pin of symbol.instruction.pins??[])owners.set(pin.id,symbol);
  for(const slot of symbol.fb?.ports??[])owners.set(slot.port.definition.id,{...symbol,instruction:slot.port.definition,row:slot.row,col:slot.input?4:6,span:1,fb:undefined});
 }
 for(const instruction of network.instructions){
  if(!instruction.note)continue;
  let symbol=owners.get(instruction.id);
  if(!symbol&&instruction!==network.pointer)symbol=[...grid.symbols].sort((a,b)=>Math.abs(a.instruction.sourceRow-instruction.sourceRow)-Math.abs(b.instruction.sourceRow-instruction.sourceRow))[0];
  const pointer=!symbol&&!!network.pointer,owner=symbol?.instruction??network.pointer;
  if(!owner)continue;
  let note=notes.get(owner.id);
  if(!note){
   const pointerRow=network.masterControl?1:0;
   const bodyTop=pointer?BASELINE-7:owner.pins?BASELINE-22:isControlMarker(owner.op)?BASELINE-12:(symbol!.contact&&!isComparisonCondition(owner.op)||isCoil(owner))?BASELINE-26:BASELINE-11;
   note={owner,instructions:[],row:symbol?.row??network.rowAlignment?.[pointerRow]??pointerRow,col:symbol?.col??0,span:symbol?.span??1,pointer,top:bodyTop,lines:[]};
   notes.set(owner.id,note);
  }
  note.instructions.push(instruction);
  note.lines.push(...instruction.note.split(/\r\n?|\n/));
 }
 return [...notes.values()].map(note=>({...note,top:note.top-3-note.lines.length*NOTE_LINE_HEIGHT}));
}
export function drawingMetrics(network:Network,rowHeight=ROW) {
 const padding=Math.max(network.comparisonNotePadding??0,0,...noteLayout(network).map(note=>-note.top));
 return {padding,rowHeight:rowHeight+padding,baseline:BASELINE+padding};
}
export function networkSize(n:Network,rowHeight=ROW,viewMode:LadderViewMode='wrap'){
 rowHeight=drawingMetrics(n,rowHeight).rowHeight;
 const g=displayGrid(n,viewMode);
 return viewMode==='scroll'&&g.pages>1
  ?{width:g.width,height:g.rows*rowHeight}
  :{width:g.width,height:g.pages*g.rows*rowHeight+(g.pages>1?g.pages*PAGE_GAP:0)};
}
export function drawingPages(g:GridLayout,rowHeight=ROW,viewMode:LadderViewMode='wrap') {
 const scrolling=viewMode==='scroll'&&g.pages>1;
 return Array.from({length:scrolling?1:g.pages},(_,page)=>({
  page,left:page*GRID_WIDTH,top:page*(g.rows*rowHeight+PAGE_GAP),width:scrolling?compactColumns(g)*CELL:GRID_WIDTH,
  outputs:g.symbols.filter(s=>!s.contact&&!s.fb&&s.instruction.op!=='NOP'&&!isControlMarker(s.instruction.op)&&(scrolling||s.col+s.span===(page+1)*COLUMNS))
 }));
}

function alignedGrid(network:Network,grid:GridLayout):GridLayout {
 const mapping=network.rowAlignment,difference=network.connectionDifferences;
 if(!mapping&&!difference)return grid;
 const row=(index:number)=>mapping?.[index]??index;
 const rows=mapping?Math.max(0,...mapping)+1:grid.rows;
 const wires=new Set(difference?.wires),inputs=new Set(difference?.inputs),outputs=new Set(difference?.outputs);
 return {...grid,rows,height:grid.pages*rows*ROW+(grid.pages>1?grid.pages*PAGE_GAP:0),symbols:grid.symbols.map(s=>({...s,row:row(s.row),fb:s.fb?{...s.fb,rows,ports:s.fb.ports.map(slot=>({...slot,row:row(slot.row)}))}:undefined,inputDifference:inputs.has(s.instruction.id)?difference!.kind:undefined,outputDifference:outputs.has(s.instruction.id)?difference!.kind:undefined})),wires:grid.wires.map((w,index)=>({...w,y1:row(w.y1),y2:row(w.y2),difference:wires.has(index)?difference!.kind:undefined}))};
}