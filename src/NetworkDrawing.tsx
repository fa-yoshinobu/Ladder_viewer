import type { Instruction, Network } from './model';
import type { DeviceComments } from './comments';
import { gridLayout, displayGrid, networkSize, SCROLLBAR_HEIGHT, COLUMNS, PAGE_GAP, drawingMetrics, type LadderViewMode } from './layout';
import { Ladder } from './Ladder';
import { MasterControlScope } from './MasterControlScope';
import { ControlFlowScope } from './ControlFlowScope';

// Statements and warnings precede the ladder; notes are positioned inside their own instruction rows.
const textRows=(network:Network)=>network.title?network.title.split('\n').length:0;
export const networkPrefix=(network:Network,zoom:number)=>textRows(network)*18*zoom+network.warnings.length*25;

export function NetworkDrawing({network,zoom,rowHeight,selected,choose,navigate,comments,showComments,viewMode='wrap',scrollContainer=true,showMasterScope=true}:{network:Network;zoom:number;rowHeight:number;selected:string;choose:(i:Instruction)=>void;navigate?:(instructionId:string)=>void;comments:DeviceComments;showComments:boolean;viewMode?:LadderViewMode;scrollContainer?:boolean;showMasterScope?:boolean}) {
 const size=networkSize(network,rowHeight,viewMode),width=size.width*zoom;
 const content=<>
  {network.title && <div class="network-statements" style={{width:width-8*zoom,fontSize:14*zoom}}>{network.title.split('\n').map((text,index)=><div key={index} class="network-title" title={text} style={{height:18*zoom,lineHeight:`${18*zoom-2}px`}}>{text}</div>)}</div>}
  {network.warnings.map(w=><div class="warning">⚠ {w}</div>)}
  <Ladder network={network} selected={selected} choose={choose} navigate={navigate} zoom={zoom} rowHeight={rowHeight} comments={comments} showComments={showComments} viewMode={viewMode}/>
 </>;
 const drawing=scrollContainer&&viewMode==='scroll'&&gridLayout(network).pages>1
  ?<div class="network-scroll" role="region" aria-label={`回路 ${network.step} 横スクロール`} tabIndex={0} style={{width:networkSize(network,rowHeight).width*zoom,height:drawingHeight(network,rowHeight,zoom,viewMode)}}><div style={{width}}>{content}</div></div>
  :content;
 if(!showMasterScope||(!network.masterControlRanges?.length&&!network.controlRanges?.length))return drawing;
 const outerWidth=scrollContainer?networkSize(network,rowHeight).width*zoom:width;
 const height=drawingHeight(network,rowHeight,zoom,viewMode,scrollContainer);
 const prefix=networkPrefix(network,zoom);
 return <div class="master-control-network" style={{position:'relative',width:outerWidth,height}}>{drawing}{!!network.masterControlRanges?.length&&<MasterControlScope network={network} zoom={zoom} rowHeight={rowHeight} viewMode={viewMode} width={outerWidth} height={height} prefix={prefix}/>}{!!network.controlRanges?.length&&<ControlFlowScope network={network} zoom={zoom} rowHeight={rowHeight} viewMode={viewMode} width={outerWidth} height={height} prefix={prefix}/>}</div>;
}
export const drawingHeight=(network:Network,rowHeight:number,zoom:number,viewMode:LadderViewMode='wrap',scrollContainer=true)=>networkSize(network,rowHeight,viewMode).height*zoom+textRows(network)*18*zoom+network.warnings.length*25+(scrollContainer&&viewMode==='scroll'&&gridLayout(network).pages>1?SCROLLBAR_HEIGHT:0);

export function instructionDrawingOffset(network:Network,instructionId:string,rowHeight:number,zoom:number,viewMode:LadderViewMode):number {
 rowHeight=drawingMetrics(network,rowHeight).rowHeight;
 const prefix=networkPrefix(network,zoom);
 if(network.pointer?.id===instructionId){
  const row=network.masterControl?1:0;
  return prefix+(network.rowAlignment?.[row]??row)*rowHeight*zoom;
 }
 const grid=displayGrid(network,viewMode),scrolling=viewMode==='scroll'&&grid.pages>1;
 let symbol=grid.symbols.find(s=>s.instruction.id===instructionId),inside=0;
 if(!symbol){
  symbol=grid.symbols.find(s=>s.instruction.pins?.some(pin=>pin.id===instructionId));
  if(symbol)inside=symbol.fb?(symbol.fb.ports.find(slot=>slot.port.definition.id===instructionId)!.row-symbol.row)*rowHeight:24+symbol.instruction.pins!.findIndex(pin=>pin.id===instructionId)*22;
 }
 if(!symbol){
  const instruction=network.instructions.find(i=>i.id===instructionId);
  if(!instruction)return 0;
  symbol=[...grid.symbols].sort((a,b)=>Math.abs(a.instruction.sourceRow-instruction.sourceRow)-Math.abs(b.instruction.sourceRow-instruction.sourceRow))[0];
 }
 if(!symbol)return prefix;
 const page=scrolling?0:Math.floor(symbol.col/COLUMNS);
 return prefix+(page*(grid.rows*rowHeight+PAGE_GAP)+symbol.row*rowHeight+inside)*zoom;
}
