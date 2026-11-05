import {blockRangeMenu,blockRangeText} from '../blockRangeCopy';
import {LEFT_GUTTER} from '../ladderMetrics';
import type {KeyenceDrawing} from './layout';
import type {KeyenceInstruction} from './model';
import {keyenceStChangedLines,ST_ROW_HEIGHT,ST_HEADER_HEIGHT} from './structuredText';
import {useMemo} from 'preact/hooks';
import {highlightStRows} from '../stSyntax';

export function KeyenceStructuredText({drawing,zoom,selected,onSelect,onContextMenu}:{drawing:KeyenceDrawing;zoom:number;selected:string;
 onSelect:(instruction:KeyenceInstruction)=>void;onContextMenu:(event:MouseEvent,instruction:KeyenceInstruction)=>void}){
 const instruction=drawing.st!,changed=keyenceStChangedLines(instruction),difference=instruction.difference?.kind;
 const colored=useMemo(()=>highlightStRows(drawing.stRows??[]),[drawing.stRows]);
 return <svg class={`kv-ladder kv-st${instruction.disabled?' kv-disabled':''}`} aria-label={`ST 元ファイル${instruction.sourceLine}行${instruction.disabled?' 無効回路':''}`} width={drawing.width*zoom} height={drawing.height*zoom} viewBox={`0 0 ${drawing.width} ${drawing.height}`}>
  <rect class="kv-statement-background" x={LEFT_GUTTER} y={0} width={drawing.width-LEFT_GUTTER-8} height={26}/>
  <text class="kv-statement" x={LEFT_GUTTER+8} y={18}>{instruction.disabled?'ST（無効回路）':'ST'}</text>
  <g role="button" tabindex={0} aria-label="STソース" class={selected===instruction.id?'kv-st-code selected':'kv-st-code'}
   onClick={()=>onSelect(instruction)} onContextMenu={event=>onContextMenu(event,instruction)}
   onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelect(instruction);}}}>
   <rect class="kv-st-hit" x={LEFT_GUTTER} y={28} width={drawing.width-LEFT_GUTTER-8} height={drawing.height-30}/>
   {(drawing.stRows??[]).map((line,index)=><g key={index}>
    {changed.has(line.sourceLine)&&<rect class={`ladder-selection-bg diff-${difference}`} x={LEFT_GUTTER} y={ST_HEADER_HEIGHT+index*ST_ROW_HEIGHT-2} width={drawing.width-LEFT_GUTTER-8} height={ST_ROW_HEIGHT}/>}
    {!line.continuation&&<text class="step-label" text-anchor="end" x={LEFT_GUTTER-9} y={ST_HEADER_HEIGHT+index*ST_ROW_HEIGHT+13}
     onContextMenu={event=>blockRangeMenu(event,blockRangeText([drawing.network]))}>{line.sourceLine}</text>}
    <text class="kv-st-source" x={LEFT_GUTTER+8} y={ST_HEADER_HEIGHT+index*ST_ROW_HEIGHT+13} xmlSpace="preserve">{colored[index].map((part,n)=><tspan key={n} class={`st-${part.kind}`}>{part.text}</tspan>)}</text>
   </g>)}
  </g>
 </svg>;
}
