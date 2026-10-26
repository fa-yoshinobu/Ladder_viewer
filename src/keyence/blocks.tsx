import type {StrokeCoordinates} from '../drawing';
import {commentLines} from '../textLayout';
import type {KeyenceSymbol} from './layout';

export function KeyenceBlock({symbol,c,showComments}:{symbol:KeyenceSymbol;c:StrokeCoordinates;showComments:boolean}){
 const {x,y,width,instruction}=symbol,X=c.x,Y=c.y;
 const changed=(index:number|undefined)=>index!==undefined&&instruction.difference?.kind==='changed'&&instruction.difference.operandChanges.includes(index);
 const lines=(value:string,xx:number,yy:number,available:number,className='command-text',highlight=false)=><text class={className+(highlight?' diff-value':'')} x={xx} y={yy} style={{whiteSpace:'pre'}}>{commentLines(value,Math.max(4,Math.floor(available/6)),2).map((line,index)=><tspan key={index} x={xx} dy={index?11:0}>{line}</tspan>)}</text>;
 if(instruction.script)return <>
  <line class={symbol.inputDifference?'wire wire-'+symbol.inputDifference:'wire'} x1={X(x)} y1={Y(y)} x2={X(x+6)} y2={Y(y)}/>
  <line class={symbol.outputDifference?'wire wire-'+symbol.outputDifference:'wire'} x1={X(x+width-6)} y1={Y(y)} x2={X(x+width)} y2={Y(y)}/>
  <rect class="command-outline" x={X(x+6)} y={Y(y-21)} width={X(x+width-6)-X(x+6)} height={Y(y+(symbol.bodyLines?.length??0)*14+27)-Y(y-21)}/>
  <text class="fb-title" x={x+14} y={y-6}>KVスクリプト</text>
  <text class="command-text kv-script-text" x={x+14} y={y+20}>{symbol.bodyLines?.map((line,index)=><tspan key={index} x={x+14} dy={index?14:0}>{line||' '}</tspan>)}</text>
 </>;
 const fb=instruction.fb!;const incoming=fb.pins.filter(p=>p.direction==='in'),outgoing=fb.pins.filter(p=>p.direction==='out');
 const count=fb.defined?Math.max(incoming.length,outgoing.length):fb.pins.length;
 const left=fb.defined?x+width*.29:x+6,right=fb.defined?x+width*.71:x+width-6;
 return <>
  <line class={symbol.inputDifference?'wire wire-'+symbol.inputDifference:'wire'} x1={X(x)} y1={Y(y)} x2={X(left)} y2={Y(y)}/>
  <line class={symbol.outputDifference?'wire wire-'+symbol.outputDifference:'wire'} x1={X(right)} y1={Y(y)} x2={X(x+width)} y2={Y(y)}/>
  <rect class="command-outline" x={X(left)} y={Y(y-21)} width={X(right)-X(left)} height={Y(y+count*44+46)-Y(y-21)}/>
  {lines(fb.name,left+8,y-6,right-left-16,'fb-title',changed(0))}
  {showComments&&lines(fb.title,left+8,y+10,right-left-16,'device-comment')}
  {fb.defined?[incoming,outgoing].map((pins,side)=>pins.map((pin,index)=>{
   const py=y+36+index*44,valueX=side?right+10:x+8,valueWidth=side?x+width-valueX-8:left-valueX-8;
   return <g key={side+'-'+pin.name}><title>{pin.name+'\n'+pin.value+'\n'+pin.comment+'\n'+pin.description}</title>
    <line class="wire" x1={X(side?right:left-6)} y1={Y(py-4)} x2={X(side?right+6:left)} y2={Y(py-4)}/>
    {lines(pin.value,valueX,py,valueWidth,'command-text',changed(pin.operandIndex))}
    {lines(pin.name,side?(left+right)/2+4:left+8,py,(right-left)/2-16,'fb-pin')}
    {showComments&&<>{lines(pin.comment,valueX,py+23,valueWidth,'device-comment')}{lines(pin.description,side?(left+right)/2+4:left+8,py+14,(right-left)/2-16,'device-comment')}</>}
   </g>;
  })):fb.pins.map((pin,index)=><g key={index}><title>{pin.value}</title>
   {lines(pin.name,x+14,y+34+index*44,90,'fb-pin')}
   {lines(pin.value,x+108,y+34+index*44,width-128,'command-text',changed(pin.operandIndex))}
  </g>)}
 </>;
}
