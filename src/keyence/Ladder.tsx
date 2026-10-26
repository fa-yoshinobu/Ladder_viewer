import {useLayoutEffect,useRef,useState} from 'preact/hooks';
import {strokeCoordinates} from '../drawing';
import {LadderGlyph,SelectionRect} from '../LadderPrimitives';
import {CommentText} from '../CommentText';
import type {KeyenceDrawing,KeyenceSymbol} from './layout';
import type {KeyenceInstruction} from './model';

export function KeyenceLadder({drawing,zoom,selected,onSelect,onContextMenu}:{drawing:KeyenceDrawing;zoom:number;selected:string;
 onSelect:(instruction:KeyenceInstruction)=>void;onContextMenu:(event:MouseEvent,instruction:KeyenceInstruction)=>void}) {
 const root=useRef<SVGSVGElement>(null);
 const [raster,setRaster]=useState({x:0,y:0,ratio:1});
 const [hovered,setHovered]=useState('');
 function updateRaster(){
  if(!root.current)return;
  const rect=root.current.getBoundingClientRect(),ratio=window.devicePixelRatio||1;
  const phase=(value:number)=>((value*ratio%1)+1)%1/ratio;
  const next={x:phase(rect.x),y:phase(rect.y),ratio};
  setRaster(old=>Math.abs(old.x-next.x)<1e-6&&Math.abs(old.y-next.y)<1e-6&&old.ratio===ratio?old:next);
 }
 useLayoutEffect(updateRaster);
 useLayoutEffect(()=>{
  const scrollers=[root.current?.closest('.network-scroll'),root.current?.closest('.kv-diagram')];
  const resolution=window.matchMedia(`(resolution: ${window.devicePixelRatio||1}dppx)`);
  for(const scroller of scrollers)scroller?.addEventListener('scroll',updateRaster,{passive:true});
  window.addEventListener('resize',updateRaster);
  resolution.addEventListener('change',updateRaster);
  return()=>{
   for(const scroller of scrollers)scroller?.removeEventListener('scroll',updateRaster);
   window.removeEventListener('resize',updateRaster);
   resolution.removeEventListener('change',updateRaster);
  };
 },[drawing,raster.ratio]);
 // Only stroke correction is shared with Mitsubishi; KEYENCE geometry stays in its own layout.
 const c=strokeCoordinates(zoom,raster.ratio,raster.x,raster.y);
 const rail=strokeCoordinates(zoom,raster.ratio,raster.x,raster.y,2);
 const X=c.x,Y=c.y;
 const line=(x1:number,y1:number,x2:number,y2:number,isRail=false)=>{
  const coordinates=isRail?rail:c;
  return <line x1={coordinates.x(x1)} y1={coordinates.y(y1)} x2={coordinates.x(x2)} y2={coordinates.y(y2)} class={isRail?'kv-rail':'kv-line'}/>;
 };
 const glyph=(symbol:KeyenceSymbol)=>{
  const {x,y,width,kind}=symbol,center=x+width/2;
  if(kind==='keep'){
   const ports=symbol.ports??[],bottom=Math.max(y,...ports.map(port=>port.y));
   return <>
    <rect class="command-outline" x={X(x+6)} y={Y(y-11)} width={X(x+width-6)-X(x+6)} height={Y(bottom+11)-Y(y-11)}/>
    <text class="device" x={center} y={y-15}>{symbol.label}</text>
    {ports.map(port=><g key={port.name}>{line(x,port.y,x+6,port.y)}<text class="command-text" x={x+14} y={port.y+4}>{port.name}</text>{port.name==='SET'&&line(x+width-6,port.y,x+width,port.y)}</g>)}
   </>;
  }
  const centered=kind==='contact'||kind==='coil'||kind==='inline';
  return <>
   <LadderGlyph kind={kind==='inline'?(symbol.operation==='invert'?'invert':'pulse'):kind==='comparison'?'comparison':kind==='contact'?'contact':kind==='coil'?'coil':'command'}
    x={x} y={y} width={width} c={c} negated={symbol.negated} pulse={kind==='inline'?(symbol.operation==='fall'?'fall':'rise'):symbol.pulse}/>
   {centered?<text class="device" x={center} y={y-15}>{symbol.label}</text>:<text class="command-text" x={x+14} y={y+4}>{symbol.label}</text>}
   {symbol.instruction.opcode.toUpperCase()==='TMR'&&/^#\d+$/.test(symbol.instruction.operands[0]??'')&&<text class="device" x={center} y={y-15}>{'T'+symbol.instruction.operands[0].slice(1)}</text>}
  </>;
 };
 const hitBounds=(symbol:KeyenceSymbol)=>({x:symbol.x+1,y:symbol.y-drawing.baseline+4,width:symbol.width-2,
  height:(symbol.kind==='keep'?Math.max(symbol.y,...(symbol.ports??[]).map(port=>port.y))-symbol.y:0)+drawing.rowHeight-8});
 const symbolKey=(symbol:KeyenceSymbol,index:number)=>symbol.instruction.id+'-'+index;
 const rails=drawing.rails??[{x:drawing.left,top:drawing.railTop,bottom:drawing.railBottom},{x:drawing.right,top:drawing.railTop,bottom:drawing.railBottom}];
 return <svg ref={root} class="kv-ladder" aria-label={`キーエンス 回路 元ファイル${drawing.network.instructions[0].sourceLine}行`} width={drawing.width*zoom} height={drawing.height*zoom} viewBox={`0 0 ${drawing.width} ${drawing.height}`} style={{'--drawing-stroke':`${c.width}px`,'--drawing-rail':`${rail.width}px`}}>
  {drawing.statementLines.map((text,index)=><g key={index}><rect class="kv-statement-background" x={drawing.left} y={index*18} width={drawing.right-drawing.left} height={18}/><text class="kv-statement" x={drawing.left+7} y={index*18+14}>{text}</text></g>)}
  {drawing.network.warnings.map((warning,index)=><text key={warning} class="kv-warning" x={drawing.left+7} y={drawing.statementLines.length*18+index*22+16}>{warning}</text>)}
  {/* Highlight fills stay behind every wire, including branches crossing another symbol's hit area. */}
  <g pointer-events="none">
   {drawing.symbols.map((symbol,index)=><SelectionRect key={symbolKey(symbol,index)} phase="background" selected={symbol.instruction.id===selected} hovered={symbolKey(symbol,index)===hovered} {...hitBounds(symbol)}/>)}
  </g>
  {rails.map((segment,index)=><g key={index}>{line(segment.x,segment.top,segment.x,segment.bottom,true)}</g>)}
  {drawing.wires.map((wire,index)=><g key={index}>{line(wire.x1,wire.y1,wire.x2,wire.y2)}</g>)}
  {(drawing.continuationLabels??[]).map((label,index)=><text key={index} class="continuation" x={label.x} y={label.y}>{label.text}</text>)}
  {Array.from(drawing.symbols.reduce((rows,symbol)=>rows.set(symbol.y,Math.min(rows.get(symbol.y)??Infinity,symbol.instruction.sourceLine)),new Map<number,number>()).entries()).map(([y,sourceLine])=><text key={y} class="step-label" x={drawing.left-9} y={y+4} text-anchor="end">{sourceLine}</text>)}
  {/* Match Mitsubishi: paint each glyph after its hit target and selection frame so its leads stay visible. */}
  {drawing.symbols.map((symbol,index)=><g key={symbolKey(symbol,index)} class={`kv-symbol${symbol.instruction.id===selected?' selected':''}`}
   role="button" tabindex={0} aria-label={`${symbol.instruction.opcode} ${symbol.instruction.operands.join(' ')} ${symbol.comment}`}
   onMouseEnter={()=>setHovered(symbolKey(symbol,index))} onMouseLeave={()=>setHovered('')}
   onClick={()=>onSelect(symbol.instruction)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelect(symbol.instruction);}}}
   onContextMenu={event=>onContextMenu(event,symbol.instruction)}>
   <title>{`元ファイル ${symbol.instruction.sourceLine}行\n${symbol.instruction.opcode} ${symbol.instruction.operands.join(' ')}${symbol.comment?'\n'+symbol.comment:''}`}</title>
   <SelectionRect phase="frame" selected={symbol.instruction.id===selected} hovered={symbolKey(symbol,index)===hovered} className="kv-hit" {...hitBounds(symbol)}/>
   <g pointer-events="none">
    {glyph(symbol)}
    {symbol.commentLines.length>0&&<CommentText text={symbol.comment} x={symbol.kind==='contact'||symbol.kind==='coil'||symbol.kind==='inline'?symbol.x+symbol.width/2:symbol.x+14}
     y={(symbol.kind==='keep'?Math.max(symbol.y,...(symbol.ports??[]).map(port=>port.y)):symbol.y)+20}
     width={symbol.width-(symbol.kind==='contact'||symbol.kind==='coil'||symbol.kind==='inline'?4:28)} centered={symbol.kind==='contact'||symbol.kind==='coil'||symbol.kind==='inline'}/>}
   </g>
  </g>)}
 </svg>;
}
