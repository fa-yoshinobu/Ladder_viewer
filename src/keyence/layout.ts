import type {KeyenceInstruction,KeyenceProgram} from './model';
import type {KeyenceExpression,KeyenceNetwork,KeyenceAction} from './logic';
import {keyenceDeviceComment} from './comments';
import {keyenceOutputStyle,keyenceNumberedDevice,type KeyenceOutputStyle} from './outputStyle';
import {CELL as KEYENCE_CELL,LEFT_GUTTER as KEYENCE_LEFT,COLUMNS as KEYENCE_COLUMNS,ROW,COMMENT_ROW,BASELINE,PAGE_GAP} from '../ladderMetrics';
import {continuationText} from '../continuation';
import {placeSymbolColumn} from '../ladderGeometry';

export {KEYENCE_CELL,KEYENCE_LEFT,KEYENCE_COLUMNS};
export interface KeyenceWire {x1:number;y1:number;x2:number;y2:number;difference?:'added'|'removed'}
export interface KeyenceSymbol {
 instruction:KeyenceInstruction;x:number;y:number;width:number;
 kind:'contact'|'comparison'|'inline'|KeyenceOutputStyle['kind'];negated:boolean;pulse:'rise'|'fall'|null;
 label:string;comment:string;commentLines:string[];
 operation?:'rise'|'fall'|'invert';ports?:{name:'SET'|'RES';y:number;difference?:'added'|'removed'}[];height?:number;
 inputDifference?:'added'|'removed';outputDifference?:'added'|'removed';
}
export interface KeyenceDrawing {
 network:KeyenceNetwork;width:number;height:number;headerHeight:number;rows:number;rowHeight:number;baseline:number;
 symbols:KeyenceSymbol[];wires:KeyenceWire[];left:number;right:number;railTop:number;railBottom:number;
 statementLines:string[];
 rails?:{x:number;top:number;bottom:number}[];
 continuationLabels?:{x:number;y:number;text:string}[];
}
const drawingSources=new WeakMap<KeyenceDrawing,{program:KeyenceProgram;showComments:boolean}>();
type Marker={kind:'marker';expression:Extract<KeyenceExpression,{kind:'unary'}>};
type Component=KeyenceExpression|Marker;
type TrieEntry={kind:'term';term:Component;node:Trie}|{kind:'output';action:KeyenceAction;port?:'SET'|'RES'};
interface Trie {entries:TrieEntry[]}
const trie=():Trie=>({entries:[]});
const visualLength=(text:string)=>Array.from(text).reduce((total,c)=>total+(/[^\x00-\xff]/.test(c)?2:1),0);
export function wrapKeyenceText(text:string,width:number):string[] {
 const lines:string[]=[];
 for(const paragraph of text.split(/\r\n?|\n/)){
  let line='',length=0;
  for(const char of paragraph){
   const size=visualLength(char);
   if(length+size>width&&line){lines.push(line);line='';length=0;}
   line+=char;length+=size;
  }
  lines.push(line);
 }
 return lines;
}
export function keyenceInstructionComment(instruction:KeyenceInstruction,program:KeyenceProgram):string {
 if(instruction.comment)return instruction.comment;
 const comments=[...new Set(instruction.operands.map(address=>keyenceDeviceComment(address,program.deviceComments)).filter(Boolean))];
 const device=keyenceNumberedDevice(instruction);
 if(device){
  const comment=keyenceDeviceComment(device,program.deviceComments);
  if(comment&&!comments.includes(comment))comments.unshift(comment);
 }
 return comments.join(' / ');
}
const commandLabel=(instruction:KeyenceInstruction)=>[instruction.opcode,...instruction.operands].join(' ');
const contactLabel=(expression:Extract<KeyenceExpression,{kind:'contact'}>)=>expression.comparison?
 [expression.comparison,...expression.instruction.operands].join(' '):expression.instruction.operands.join(' ');
function contactWidth(expression:Extract<KeyenceExpression,{kind:'contact'}>):number {
 return expression.comparison?Math.max(1+expression.instruction.operands.length,Math.ceil((visualLength(contactLabel(expression))*7+24)/KEYENCE_CELL)):1;
}
const symbolColumn=(column:number,span:number,wrap:boolean)=>wrap?placeSymbolColumn(column,span,KEYENCE_COLUMNS):column;
function endColumn(expression:Component,column:number,wrap:boolean):number {
 if(expression.kind==='marker')return symbolColumn(column,1,wrap)+1;
 if(expression.kind==='unary')return symbolColumn(expression.input?endColumn(expression.input,column,wrap):column,1,wrap)+1;
 if(expression.kind==='contact'){const span=contactWidth(expression);return symbolColumn(column,span,wrap)+span;}
 const left=endColumn(expression.left,column,wrap);
 return expression.kind==='and'?endColumn(expression.right,left,wrap):Math.max(left,endColumn(expression.right,column,wrap));
}
const outputWidth=(instruction:KeyenceInstruction)=>{
 const style=keyenceOutputStyle(instruction);
 if(style.kind==='coil')return 1;
 return style.kind==='command'?Math.max(1+instruction.operands.length,Math.ceil((visualLength(style.body)*7+24)/KEYENCE_CELL)):
  Math.max(1,Math.ceil((Math.max(visualLength(style.body),visualLength(style.above))*7+24)/KEYENCE_CELL));
};
function actionEnd(action:KeyenceAction,column:number,wrap:boolean):number {
 for(const instruction of [action.instruction,...action.continuations??[]]){
  const span=outputWidth(instruction);column=symbolColumn(column,span,wrap)+span;
 }
 return column;
}
function trieEnd(node:Trie,column:number,wrap:boolean):number {
 return Math.max(column,...node.entries.map(entry=>entry.kind==='output'?actionEnd(entry.action,column,wrap):trieEnd(entry.node,endColumn(entry.term,column,wrap),wrap)));
}
function mergedWires(wires:KeyenceWire[]):KeyenceWire[] {
 const groups=new Map<string,{horizontal:boolean;fixed:number;ranges:[number,number][]}>();
 for(const wire of wires){
  const horizontal=wire.y1===wire.y2,fixed=horizontal?wire.y1:wire.x1;
  const a=horizontal?wire.x1:wire.y1,b=horizontal?wire.x2:wire.y2;
  if(a===b)continue;
  const key=(horizontal?'h':'v')+fixed;
  let group=groups.get(key);if(!group){group={horizontal,fixed,ranges:[]};groups.set(key,group);}
  group.ranges.push([Math.min(a,b),Math.max(a,b)]);
 }
 const result:KeyenceWire[]=[];
 for(const {horizontal,fixed,ranges} of groups.values()){
  ranges.sort((a,b)=>a[0]-b[0]);
  const merged:[number,number][]=[];
  for(const range of ranges){
   const previous=merged.at(-1);
   if(previous&&range[0]<=previous[1])previous[1]=Math.max(previous[1],range[1]);
   else merged.push([...range]);
  }
  for(const [start,end] of merged)result.push(horizontal?{x1:start,y1:fixed,x2:end,y2:fixed}:{x1:fixed,y1:start,x2:fixed,y2:end});
 }
 return result;
}

export function layoutKeyenceNetwork(network:KeyenceNetwork,program:KeyenceProgram,showComments=true,wrap=false):KeyenceDrawing {
 const root=trie(),markers=new Map<KeyenceExpression,Marker>();
 const marker=(expression:Extract<KeyenceExpression,{kind:'unary'}>):Marker=>{
  let found=markers.get(expression);
  if(!found){found={kind:'marker',expression};markers.set(expression,found);}
  return found;
 };
 const terms=(expression:KeyenceExpression|null):Component[]=>{
  if(!expression)return [];
  if(expression.kind==='and')return [...terms(expression.left),...terms(expression.right)];
  if(expression.kind==='unary')return [...terms(expression.input),marker(expression)];
  return [expression];
 };
 const insert=(action:KeyenceAction,condition:KeyenceExpression|null,port?:'SET'|'RES')=>{
  let node=root;
  for(const term of terms(condition)){
   const previous=node.entries.at(-1);
   let child=previous?.kind==='term'&&previous.term===term?previous.node:undefined;
   if(!child){child=trie();node.entries.push({kind:'term',term,node:child});}
   node=child;
  }
  node.entries.push({kind:'output',action,port});
 };
 for(const action of network.actions){
  if(action.resetCondition!==undefined){insert(action,action.condition,'SET');insert(action,action.resetCondition,'RES');}
  else insert(action,action.condition);
 }
 const requiredColumns=Math.max(KEYENCE_COLUMNS,trieEnd(root,0,wrap),network.actions.length?0:network.condition?endColumn(network.condition,0,wrap):0);
 const columns=wrap?Math.ceil(requiredColumns/KEYENCE_COLUMNS)*KEYENCE_COLUMNS:requiredColumns;
 const gridRight=KEYENCE_LEFT+columns*KEYENCE_CELL,right=gridRight+8;
 const statementLines=network.statement?wrapKeyenceText(network.statement,Math.max(20,Math.floor((right-KEYENCE_LEFT)/7))):[];
 const headerHeight=statementLines.length*18+network.warnings.length*22;
 const hasComments=program.instructions.some(instruction=>!!instruction.comment)||Object.keys(program.deviceComments).length>0;
 const rowHeight=showComments&&hasComments?COMMENT_ROW:ROW,top=headerHeight+BASELINE;
 const symbols:KeyenceSymbol[]=[],wires:KeyenceWire[]=[];
 const x=(column:number)=>KEYENCE_LEFT+column*KEYENCE_CELL,y=(row:number)=>top+row*rowHeight;
 const wire=(x1:number,y1:number,x2:number,y2:number)=>wires.push({x1,y1,x2,y2});
 const symbol=(instruction:KeyenceInstruction,column:number,row:number,span:number,kind:KeyenceSymbol['kind'],label:string,negated=false,pulse:KeyenceSymbol['pulse']=null)=>{
  const comment=keyenceInstructionComment(instruction,program);
  const commentLines=showComments&&comment?wrapKeyenceText(comment,Math.max(8,Math.floor((span*KEYENCE_CELL-12)/6))):[];
  const result:KeyenceSymbol={instruction,x:x(column),y:y(row),width:span*KEYENCE_CELL,kind,negated,pulse,label,comment,
   commentLines:commentLines.length>2?[commentLines[0],commentLines[1].slice(0,-1)+'…']:commentLines};
  symbols.push(result);return result;
 };
 // OR trees keep separate split/merge points; later outputs cannot feed earlier ones.
 const expression=(term:Component,column:number,row:number):{end:number;height:number}=>{
  if(term.kind==='marker'){
   const node=term.expression,start=symbolColumn(column,1,wrap);
   wire(x(column),y(row),x(start),y(row));
   const placed=symbol(node.instruction,start,row,1,'inline',node.instruction.opcode);
   placed.operation=node.operation;return {end:start+1,height:1};
  }
  if(term.kind==='unary'){
   const input=term.input?expression(term.input,column,row):{end:column,height:1};
   const placed=expression(marker(term),input.end,row);
   return {end:placed.end,height:input.height};
  }
  if(term.kind==='contact'){
   const span=contactWidth(term),start=symbolColumn(column,span,wrap),kind=term.comparison?'comparison':'contact';
   wire(x(column),y(row),x(start),y(row));
   symbol(term.instruction,start,row,span,kind,contactLabel(term),term.negated,term.pulse);
   return {end:start+span,height:1};
  }
  const left=expression(term.left,column,row);
  if(term.kind==='and'){
   const rhs=expression(term.right,left.end,row);
   return {end:rhs.end,height:Math.max(left.height,rhs.height)};
  }
  const rhs=expression(term.right,column,row+left.height),end=Math.max(left.end,rhs.end);
  wire(x(left.end),y(row),x(end),y(row));
  wire(x(rhs.end),y(row+left.height),x(end),y(row+left.height));
  wire(x(column),y(row),x(column),y(row+left.height));
  wire(x(end),y(row),x(end),y(row+left.height));
  return {end,height:left.height+rhs.height};
 };
 const outputPositions=(action:KeyenceAction)=>{
  let end=columns;
  const positions:{instruction:KeyenceInstruction;column:number;span:number}[]=[];
  for(const instruction of [action.instruction,...action.continuations??[]].reverse()){
   const span=outputWidth(instruction);
   let column=end-span;
   if(wrap&&span<=KEYENCE_COLUMNS&&placeSymbolColumn(column,span,KEYENCE_COLUMNS)!==column)
    column=Math.floor(end/KEYENCE_COLUMNS)*KEYENCE_COLUMNS-span;
   positions.unshift({instruction,column,span});end=column;
  }
  return positions;
 };
 const keepPorts=new Map<KeyenceAction,{ports:{name:'SET'|'RES';row:number}[];symbol:KeyenceSymbol}>();
 const drawTrie=(node:Trie,column:number,row:number):number=>{
  let cursor=row,last=row;
  for(const entry of node.entries){
   last=cursor;
   if(entry.kind==='output'){
    const {action}=entry,positions=outputPositions(action),outputColumn=positions[0].column;
    wire(x(column),y(cursor),x(outputColumn),y(cursor));
    if(entry.port){
     let keep=keepPorts.get(action);
     if(!keep){
      keep={ports:[],symbol:symbol(action.instruction,outputColumn,cursor,positions[0].span,'keep',commandLabel(action.instruction))};
      keepPorts.set(action,keep);
     }
     keep.ports.push({name:entry.port,row:cursor});
     if(entry.port==='SET')wire(gridRight,y(cursor),right,y(cursor));
    }else{
     let previous=outputColumn;
     for(const {instruction,column:output,span} of positions){
      wire(x(previous),y(cursor),x(output),y(cursor));
      const style=keyenceOutputStyle(instruction);
      symbol(instruction,output,cursor,span,style.kind,style.kind==='coil'?style.body:commandLabel(instruction));previous=output+span;
     }
     wire(x(previous),y(cursor),right,y(cursor));
    }
    cursor++;
   }else{
    const component=expression(entry.term,column,cursor);
    const children=drawTrie(entry.node,component.end,cursor);
    cursor+=Math.max(component.height,children);
   }
  }
  if(last>row)wire(x(column),y(row),x(column),y(last));
  return Math.max(1,cursor-row);
 };
 let rows=1;
 if(network.actions.length)rows=drawTrie(root,0,0);
 else if(network.condition){const component=expression(network.condition,0,0);rows=component.height;wire(x(component.end),y(0),right,y(0));}
 for(const {ports,symbol:placed} of keepPorts.values()){
  const first=Math.min(...ports.map(port=>port.row)),last=Math.max(...ports.map(port=>port.row));
  placed.ports=ports.map(port=>({name:port.name,y:y(port.row)}));placed.height=(last-first)*rowHeight+24;
 }
 const height=headerHeight+rows*rowHeight;
 const drawing:KeyenceDrawing={network,width:right+8,height,headerHeight,rows,rowHeight,baseline:BASELINE,symbols,wires:mergedWires(wires),left:KEYENCE_LEFT,right,
  railTop:headerHeight,railBottom:height,statementLines};
 if(!wrap)drawingSources.set(drawing,{program,showComments});
 return drawing;
}

// Fold the finished drawing so parsing, conditions and source instruction identities stay unchanged.
export function keyenceViewDrawing(base:KeyenceDrawing,mode:'wrap'|'scroll'):KeyenceDrawing {
 const limit=KEYENCE_COLUMNS*KEYENCE_CELL;
 let gridRight=base.right-8;
 if(mode==='scroll'||gridRight-base.left<=limit)return base;
 const source=drawingSources.get(base);
 if(source){base=layoutKeyenceNetwork(base.network,source.program,source.showComments,true);gridRight=base.right-8;}
 const candidates=new Set<number>([base.left,gridRight]);
 for(let x=base.left+KEYENCE_CELL;x<gridRight;x+=KEYENCE_CELL)candidates.add(x);
 for(const symbol of base.symbols){candidates.add(symbol.x);candidates.add(symbol.x+symbol.width);}
 const boundaries=[...candidates].filter(x=>x>=base.left&&x<=gridRight&&
  !base.symbols.some(symbol=>symbol.x<x&&symbol.x+symbol.width>x)).sort((a,b)=>a-b);
 const pages:{start:number;end:number}[]=[];
 for(let start=base.left;start<gridRight;){
  let end=start;
  for(const boundary of boundaries)if(boundary>start&&boundary<=start+limit)end=boundary;
  // Keep an indivisible symbol intact even when it is wider than the normal twelve columns.
  if(end===start)end=boundaries.find(boundary=>boundary>start)??gridRight;
  pages.push({start,end});start=end;
 }
 const canvasGrid=Math.max(limit,...pages.map(page=>page.end-page.start)),right=base.left+canvasGrid+8;
 const statementLines=base.network.statement?wrapKeyenceText(base.network.statement,Math.max(20,Math.floor(canvasGrid/7))):[];
 const headerHeight=statementLines.length*18+base.network.warnings.length*22;
 const pageHeight=base.height-base.headerHeight;
 const offset=(index:number)=>headerHeight-base.headerHeight+index*(pageHeight+PAGE_GAP);
 const shiftX=(index:number)=>base.left-pages[index].start+(index===pages.length-1?canvasGrid-(pages[index].end-pages[index].start):0);
 const symbols:KeyenceSymbol[]=[],wires:KeyenceWire[]=[],rails:NonNullable<KeyenceDrawing['rails']>=[];
 const continuationLabels:NonNullable<KeyenceDrawing['continuationLabels']>=[];
 for(const [index,page] of pages.entries()){
  const dx=shiftX(index),dy=offset(index);
  for(const symbol of base.symbols)if(symbol.x>=page.start&&symbol.x+symbol.width<=page.end){
   symbols.push({...symbol,x:symbol.x+dx,y:symbol.y+dy,
    ...(symbol.ports?{ports:symbol.ports.map(port=>({...port,y:port.y+dy}))}:{})});
  }
  for(const wire of base.wires){
   if(wire.y1===wire.y2){
    const start=Math.max(page.start,Math.min(wire.x1,wire.x2)),end=Math.min(page.end+(index===pages.length-1?8:0),Math.max(wire.x1,wire.x2));
    if(start<end)wires.push({...wire,x1:start+dx,y1:wire.y1+dy,x2:end+dx,y2:wire.y2+dy});
   }else if(wire.x1>=page.start&&(wire.x1<page.end||index===pages.length-1&&wire.x1<=base.right)){
    // A vertical branch on a cut belongs to the following page, once.
    wires.push({...wire,x1:wire.x1+dx,x2:wire.x2+dx,y1:wire.y1+dy,y2:wire.y2+dy});
   }
  }
  if(index===0)rails.push({x:base.left,top:base.railTop+dy,bottom:base.railBottom+dy});
  if(index===pages.length-1)rails.push({x:page.end+dx+8,top:base.railTop+dy,bottom:base.railBottom+dy});
  continuationLabels.push({x:base.left+8,y:base.railBottom+dy+15,text:continuationText(index,pages.length)});
 }
 for(let index=0;index<pages.length-1;index++){
  const cut=pages[index].end,inputX=cut+shiftX(index+1);
  if(inputX===base.left)continue;
  const left=new Set<number>(),rightSide=new Set<number>();
  for(const wire of base.wires)if(wire.y1===wire.y2){
   const start=Math.min(wire.x1,wire.x2),end=Math.max(wire.x1,wire.x2);
   if(start<cut&&end>=cut)left.add(wire.y1);
   if(start<=cut&&end>cut)rightSide.add(wire.y1);
  }
  for(const symbol of base.symbols){
   if(symbol.x===cut)for(const y of symbol.ports?.map(port=>port.y)??[symbol.y])rightSide.add(y);
   if(symbol.x+symbol.width===cut)left.add(symbol.y);
  }
  for(const wire of base.wires)if(wire.x1===cut&&wire.x2===cut){
   const top=Math.min(wire.y1,wire.y2),bottom=Math.max(wire.y1,wire.y2);
   for(const y of left)if(y>=top&&y<=bottom)rightSide.add(y);
  }
  for(const y of left)if(rightSide.has(y)){
   const inputY=y+offset(index+1);
   const crossing=base.wires.find(w=>w.y1===y&&w.y2===y&&Math.min(w.x1,w.x2)<=cut&&Math.max(w.x1,w.x2)>=cut);
   const terminal=base.symbols.find(s=>s.x===cut&&s.y===y);
   wires.push({x1:base.left,y1:inputY,x2:inputX,y2:inputY,difference:crossing?.difference??terminal?.inputDifference});
  }
 }
 const height=headerHeight+pages.length*(pageHeight+PAGE_GAP);
 return {...base,width:right+8,right,height,headerHeight,statementLines,rows:base.rows*pages.length,
  symbols,wires,rails,continuationLabels,railTop:headerHeight,railBottom:height};
}
