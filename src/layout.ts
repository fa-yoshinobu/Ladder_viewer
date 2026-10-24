import type { Instruction, Logic, Network } from './model';
export const CELL = 74;
export const ROW = 56;
export const COLUMNS = 12;
export const isCoil = (i:Instruction) => /^(OUT|OUTH)$/.test(i.op) && i.operands.length===1;
export const GRID_WIDTH = COLUMNS * CELL;
export const LEFT_GUTTER = 82;
export const LADDER_WIDTH = LEFT_GUTTER + GRID_WIDTH + 16;
export const BASELINE = 28;
export const PAGE_GAP = 22;
export interface GridSymbol { instruction: Instruction; col: number; row: number; span: number; contact: boolean; }
export interface GridWire { x1: number; y1: number; x2: number; y2: number; }
export interface GridLayout { symbols: GridSymbol[]; wires: GridWire[]; rows: number; pages: number; width: number; height: number; }
export function size(logic: Logic | null): { width: number; height: number } {
 if(!logic) return {width:0,height:1};
 if(logic.kind==='contact') return {width:/[=<>]/.test(logic.instruction.op)?1+logic.instruction.operands.length:1,height:1};
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
 const existing=cache.get(n); if(existing) return existing;
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
   const start=Math.floor(x/COLUMNS)===Math.floor((x+span-1)/COLUMNS)?x:Math.ceil(x/COLUMNS)*COLUMNS;
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
 let nextRow=0;let maxCol=COLUMNS;
 for(const action of n.actions) {
  const startRow=nextRow;
  const end=action.condition?place(action.condition,0,startRow):{col:0,row:startRow,bottom:startRow};
  const i=action.instruction;
  const coil=isCoil(i);
  const span=i.pins?5:coil?1:Math.max(1,1+i.operands.length);
  const target=Math.ceil((end.col+span)/COLUMNS)*COLUMNS-span;
  route(end,target,startRow);
  symbols.push({instruction:i,col:target,row:startRow,span,contact:false});
  maxCol=Math.max(maxCol,target+span);
  nextRow=Math.max(startRow,end.bottom)+(i.pins ? Math.ceil((i.pins.length*22+66)/ROW) : 1);
 }
 if(!n.actions.length)for(const i of n.instructions.filter(i=>i!==n.pointer)) {symbols.push({instruction:i,col:0,row:nextRow++,span:1+i.operands.length,contact:false});}
 const rows=Math.max(1,nextRow);const pages=Math.ceil(maxCol/COLUMNS);
 const result={symbols,wires:mergeWires(wires),rows,pages,width:LADDER_WIDTH,height:pages*rows*ROW+(pages>1 ? pages*PAGE_GAP : 0)};cache.set(n,result);return result;
}
export function networkSize(n:Network,rowHeight=ROW){const g=gridLayout(n);return{width:g.width,height:g.pages*g.rows*rowHeight+(g.pages>1?g.pages*PAGE_GAP:0)};}
