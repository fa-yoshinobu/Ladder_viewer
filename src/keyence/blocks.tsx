import type {StrokeCoordinates} from '../drawing';
import type {KeyenceSymbol} from './layout';
import {keyenceBlockGeometry,keyenceStBoxGeometry} from './blockGeometry';
import {keyenceStChangedLines,ST_ROW_HEIGHT} from './structuredText';
import {highlightStRows} from '../stSyntax';

export function KeyenceBlock({symbol,c}:{symbol:KeyenceSymbol;c:StrokeCoordinates}){
 const {x,y,width,instruction}=symbol,X=c.x,Y=c.y,fb=instruction.fb!,g=keyenceBlockGeometry(fb);
 const changed=(index:number)=>instruction.difference?.kind==='changed'&&instruction.difference.operandChanges.includes(index);
 const lines=(values:string[],xx:number,yy:number,className='command-text',anchor:'start'|'middle'|'end'='start',highlight=false)=><text class={className+(highlight?' diff-value':'')} x={xx} y={yy} text-anchor={anchor} style={{whiteSpace:'pre',textAnchor:anchor}}>{values.map((line,index)=><tspan key={index} x={xx} dy={index?12:0}>{line}</tspan>)}</text>;
 const left=x+g.left,right=x+g.right,center=(left+right)/2;
 const wire=(x1:number,yy:number,x2:number,difference?:'added'|'removed')=><line class={difference?'wire wire-'+difference:'wire'} x1={X(x1)} y1={Y(yy)} x2={X(x2)} y2={Y(yy)}/>;
 return <>
  {fb.powerInput!==null&&wire(x,y,left,symbol.inputDifference)}
  {fb.powerOutput!==null&&wire(right,y,x+width,symbol.outputDifference)}
  <rect class="command-outline" x={X(left)} y={Y(y+g.bodyTop)} width={X(right)-X(left)} height={Y(y+g.bottom)-Y(y+g.bodyTop)}/>
  <rect x={left} y={y+g.bodyTop} width={right-left} height={-8-g.bodyTop} fill="currentColor" opacity={0.12}/>
  {lines(g.titleLines,center,y+g.bodyTop+(g.known?11:15),'fb-title','middle',changed(0))}
  {g.instanceLines.length>0&&lines(g.instanceLines,center,y+g.bodyTop-5-(g.instanceLines.length-1)*12,'fb-title','middle',fb.instanceOperandIndex!==undefined&&changed(fb.instanceOperandIndex))}
  {g.known&&<>{lines([fb.powerInput??'EN'],left+6,y+4,'fb-pin')}{fb.powerOutput&&lines([fb.powerOutput],right-6,y+4,'fb-pin','end')}</>}
  {g.pins.map(({pin,side,y:offset,nameLines,valueLines},index)=><g key={index}><title>{pin.name+': '+pin.value}</title>
   {side==='argument'?<>{lines(nameLines,left+8,y+offset+4,'fb-pin')}{lines(valueLines,x+108,y+offset+4,'command-text','start',changed(pin.operandIndex))}</>:
    side==='input'?<>{wire(left-10,y+offset,left)}{lines(valueLines,left-14,y+offset+4,'command-text','end',changed(pin.operandIndex))}{lines(nameLines,left+6,y+offset+4,'fb-pin')}</>:
    <>{wire(right,y+offset,right+10)}{lines(nameLines,right-6,y+offset+4,'fb-pin','end')}{lines(valueLines,right+14,y+offset+4,'command-text','start',changed(pin.operandIndex))}</>}
  </g>)}
  {symbol.commentLines.length>0&&lines(symbol.commentLines,x+8,y+g.bottom+16,'device-comment')}
 </>;
}

export function KeyenceStBox({symbol,c}:{symbol:KeyenceSymbol;c:StrokeCoordinates}){
 const {x,y,width,instruction}=symbol,g=keyenceStBoxGeometry(instruction),X=c.x,Y=c.y;
 const changed=keyenceStChangedLines(instruction),difference=instruction.difference?.kind;
 const colored=highlightStRows(g.rows);
 return <g class="kv-st-box">
  <line class={symbol.inputDifference?'wire wire-'+symbol.inputDifference:'wire'} x1={X(x)} y1={Y(y)} x2={X(x+6)} y2={Y(y)}/>
  <line class={symbol.outputDifference?'wire wire-'+symbol.outputDifference:'wire'} x1={X(x+width-6)} y1={Y(y)} x2={X(x+width)} y2={Y(y)}/>
  <rect class="command-outline" x={X(x+6)} y={Y(y+g.top)} width={X(x+width-6)-X(x+6)} height={Y(y+g.bottom)-Y(y+g.top)}/>
  {g.rows.map((line,index)=><g key={index}>
   <title>{'元ファイル '+line.sourceLine+'行'}</title>
   {changed.has(line.sourceLine)&&<rect class={`ladder-selection-bg diff-${difference}`} x={x+7} y={y+g.top+index*ST_ROW_HEIGHT+2} width={width-14} height={ST_ROW_HEIGHT}/>}
   <text class="kv-st-source" x={x+12} y={y-8+index*ST_ROW_HEIGHT} xmlSpace="preserve">{colored[index].map((part,n)=><tspan key={n} class={`st-${part.kind}`}>{part.text}</tspan>)}</text>
  </g>)}
 </g>;
}
