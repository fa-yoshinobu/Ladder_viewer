import type { Instruction, Network } from './model';
import type { DeviceComments } from './comments';
import { gridLayout, networkSize, SCROLLBAR_HEIGHT, type LadderViewMode } from './layout';
import { Ladder } from './Ladder';
import { MasterControlScope } from './MasterControlScope';

export function NetworkDrawing({network,zoom,rowHeight,selected,choose,comments,showComments,viewMode='wrap',scrollContainer=true,showMasterScope=true}:{network:Network;zoom:number;rowHeight:number;selected:string;choose:(i:Instruction)=>void;comments:DeviceComments;showComments:boolean;viewMode?:LadderViewMode;scrollContainer?:boolean;showMasterScope?:boolean}) {
 const size=networkSize(network,rowHeight,viewMode),width=size.width*zoom;
 const content=<>
  {network.title && <div class="network-statements" style={{width:width-8*zoom,fontSize:14*zoom}}>{network.title.split('\n').map((text,index)=><div key={index} class="network-title" title={text} style={{height:18*zoom,lineHeight:`${18*zoom-2}px`}}>{text}</div>)}</div>}
  {network.warnings.map(w=><div class="warning">⚠ {w}</div>)}
  <Ladder network={network} selected={selected} choose={choose} zoom={zoom} rowHeight={rowHeight} comments={comments} showComments={showComments} viewMode={viewMode}/>
 </>;
 const drawing=scrollContainer&&viewMode==='scroll'&&gridLayout(network).pages>1
  ?<div class="network-scroll" role="region" aria-label={`回路 ${network.step} 横スクロール`} tabIndex={0} style={{width:networkSize(network,rowHeight).width*zoom,height:drawingHeight(network,rowHeight,zoom,viewMode)}}><div style={{width}}>{content}</div></div>
  :content;
 if(!showMasterScope||!network.masterControlRanges?.length)return drawing;
 const outerWidth=scrollContainer?networkSize(network,rowHeight).width*zoom:width;
 const height=drawingHeight(network,rowHeight,zoom,viewMode,scrollContainer);
 const prefix=(network.title?network.title.split('\n').length*18*zoom:0)+network.warnings.length*25;
 return <div class="master-control-network" style={{position:'relative',width:outerWidth,height}}>{drawing}<MasterControlScope network={network} zoom={zoom} rowHeight={rowHeight} viewMode={viewMode} width={outerWidth} height={height} prefix={prefix}/></div>;
}
export const drawingHeight=(network:Network,rowHeight:number,zoom:number,viewMode:LadderViewMode='wrap',scrollContainer=true)=>networkSize(network,rowHeight,viewMode).height*zoom+(network.title?network.title.split('\n').length*18*zoom:0)+network.warnings.length*25+(scrollContainer&&viewMode==='scroll'&&gridLayout(network).pages>1?SCROLLBAR_HEIGHT:0);
