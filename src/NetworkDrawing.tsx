import type { Instruction, Network } from './model';
import type { DeviceComments } from './comments';
import { networkSize } from './layout';
import { Ladder } from './Ladder';

export function NetworkDrawing({network,zoom,rowHeight,selected,choose,comments,showComments}:{network:Network;zoom:number;rowHeight:number;selected:string;choose:(i:Instruction)=>void;comments:DeviceComments;showComments:boolean}) {
 const size=networkSize(network,rowHeight),width=size.width*zoom;
 return <>
  {network.title && <div class="network-statements" style={{width:width-8*zoom,fontSize:14*zoom}}>{network.title.split('\n').map((text,index)=><div key={index} class="network-title" title={text} style={{height:18*zoom,lineHeight:`${18*zoom-2}px`}}>{text}</div>)}</div>}
  {network.warnings.map(w=><div class="warning">⚠ {w}</div>)}
  <Ladder network={network} selected={selected} choose={choose} zoom={zoom} rowHeight={rowHeight} comments={comments} showComments={showComments}/>
 </>;
}
export const drawingHeight=(network:Network,rowHeight:number,zoom:number)=>networkSize(network,rowHeight).height*zoom+(network.title?network.title.split('\n').length*18*zoom:0)+network.warnings.length*25;