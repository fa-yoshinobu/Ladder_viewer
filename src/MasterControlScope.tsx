import type { Instruction, Network } from './model';
import type { MasterControlRange } from './masterControl';
import { drawingMetrics, COLUMNS, PAGE_GAP, displayGrid, type LadderViewMode } from './layout';

export function MasterControlScope({network,zoom,rowHeight,viewMode,width,height,prefix,ranges,continuationOnly=false}:{network:Network;zoom:number;rowHeight:number;viewMode:LadderViewMode;width:number;height:number;prefix:number;ranges?:MasterControlRange[];continuationOnly?:boolean}) {
 const metrics=drawingMetrics(network,rowHeight);
 rowHeight=metrics.rowHeight;
 const grid=continuationOnly?undefined:displayGrid(network,viewMode),scrolling=viewMode==='scroll'&&!!grid&&grid.pages>1;
 const position=(instruction:Instruction|undefined)=>{
  if(!grid)return undefined;
  const symbol=instruction&&grid.symbols.find(symbol=>symbol.instruction.id===instruction.id);
  if(!symbol)return undefined;
  const page=scrolling?0:Math.floor(symbol.col/COLUMNS);
  return prefix+(page*(grid.rows*rowHeight+PAGE_GAP)+symbol.row*rowHeight+metrics.baseline+12)*zoom;
 };
 return <svg class="master-control-scope" width={width} height={height} aria-label="MC制御範囲">
  {(ranges??network.masterControlRanges)?.map(range=>{
   const start=position(range.start),end=position(range.end);
   const top=Math.min(height,start??0),bottom=Math.min(height,end??height),x=(4+range.lane*4)*zoom,cap=12*zoom;
   const label=`MC N${range.level} ${range.start.operands.slice(1).join(' ')}（STEP ${range.start.step}）→ ${range.end?`MCR ${range.end.operands[0]}（STEP ${range.end.step}）`:'対応MCRなし'}`;
   return <g key={range.start.id} class={range.end?'':'master-control-open'}>
    <title>{label}</title>
    <path d={`M${x},${top}V${bottom}${start!==undefined?` M${x},${top}H${x+cap}`:''}${end!==undefined?` M${x},${bottom}H${x+cap}`:''}`}/>
    {start!==undefined&&<text x={x+cap+2*zoom} y={top-4*zoom} font-size={9*zoom}>N{range.level}</text>}
   </g>;
  })}
 </svg>;
}