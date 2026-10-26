import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { differenceLabels, type Instruction, type Network } from './model';
import { AddressText } from './AddressText';
import { nativeCsvBridge } from './nativeCsv';
import { instructionCopyText } from './instructionCopy';
import { isComparisonCondition, isInlineLogic } from './instructions';
import { isControlMarker } from './controlFlow';
import { CommentText } from './CommentText';
import {LadderGlyph,SelectionRect} from './LadderPrimitives';
import {continuationText} from './continuation';
import { deviceComment, type DeviceComments } from './comments';
import { strokeCoordinates, type StrokeCoordinates } from './drawing';
import { CELL, BASELINE, LEFT_GUTTER, displayGrid, networkSize, drawingPages, isCoil, drawingMetrics, noteLayout, NOTE_LINE_HEIGHT, inlineSTLines, inlineSTHeight, type GridSymbol, type LadderViewMode } from './layout';

const line = (c: StrokeCoordinates, x1: number, y1: number, x2: number, y2: number, className = 'wire') =>
  <line x1={c.x(x1)} y1={c.y(y1)} x2={c.x(x2)} y2={c.y(y2)} class={className}/>;

function Operand({instruction,index,maxLength}:{instruction:Instruction;index:number;maxLength?:number}) {
 return <tspan class={instruction.difference?.operandChanges.includes(index)?'diff-value':''}><AddressText text={instruction.operands[index]} svg maxLength={maxLength}/></tspan>;
}
function instructionMenu(event: MouseEvent, instruction: Instruction, comments: DeviceComments, choose: (i: Instruction) => void) {
  event.preventDefault();
  event.stopPropagation();
  choose(instruction);
  nativeCsvBridge()?.postMessage({ type: 'instruction-menu', text: instructionCopyText(instruction, comments) });
}
function symbolBounds(s:GridSymbol,rowHeight:number,baseline:number){
 const x=s.col*CELL,y=s.row*rowHeight+baseline,w=s.span*CELL,i=s.instruction;
 return {x:x+(i.inlineST?6:1),y:i.inlineST?y-11:s.row*rowHeight+4,width:w-(i.inlineST?12:2),
  height:s.fb?s.fb.rows*rowHeight-8:i.inlineST?inlineSTHeight(i,s.span):i.pins?i.pins.length*22+54+baseline-BASELINE:rowHeight-8};
}
function Symbol({ s, selected, hovered, hover, choose, navigate, c, rowHeight, baseline, comments, showComments }: { s: GridSymbol; selected: string; hovered:boolean;hover:(id:string)=>void; choose: (i: Instruction) => void; navigate?: (instructionId: string) => void; c: StrokeCoordinates; rowHeight: number; baseline: number; comments: DeviceComments; showComments: boolean }) {
  const i = s.instruction;
  const x = s.col * CELL, y = s.row * rowHeight + baseline, w = s.span * CELL, cx = x + CELL / 2;
  const X = c.x, Y = c.y;
  const inputClass=s.inputDifference?`wire wire-${s.inputDifference}`:'wire';
  const outputClass=s.outputDifference?`wire wire-${s.outputDifference}`:'wire';
  const coil = !s.contact && isCoil(i), marker = isControlMarker(i.op);
  const comparison = s.contact && isComparisonCondition(i.op);
  const inverse = /^(LDI|ANI|ORI|LDPI|ANDPI|ORPI|LDFI|ANDFI|ORFI)$/.test(i.op);
  const pulse = /PI?$/.test(i.op) ? -1 : /FI?$/.test(i.op) ? 1 : 0;
  const special = s.contact && (isInlineLogic(i.op) || i.op === 'PHASE');
  const centered = (s.contact && !comparison && i.op !== 'PHASE') || coil;
  const command = comparison ? i.op.replace(/^(LD|AND|OR)/, '') : i.op;
  const labels = i.operands.map(operand => ({ operand, text: deviceComment(operand, comments) })).filter(item => item.text);
  const description = labels.length > 1 ? labels.map(item => `${item.operand}: ${item.text}`).join(' / ') : labels[0]?.text ?? '';
  const flow=i.controlFlow;
  const flowArrow=flow?.kind==='jump'?'→ ':flow?.kind==='return'?'↩ ':flow?.kind==='exit'?'↪ ':flow?.kind==='loop'&&/^END/.test(i.op)?'↶ ':'';
  const scopeTarget=flow?.kind==='boundary'||(flow?.kind==='loop'&&!/^END/.test(i.op))||(flow?.kind==='branch'&&!/^(THEN|CASETHEN|WHILEDO|FORDO)$/.test(i.op));
  return <g data-instruction-id={i.id} class={`symbol ${i.difference?'diff-'+i.difference.kind:''} ${selected === i.id ? 'chosen' : ''}`} role="button" tabIndex={0}
    aria-label={`${i.op} ${i.operands.join(' ')}`} onMouseEnter={()=>hover(i.id)} onMouseLeave={()=>hover('')} onClick={() => choose(i)} onContextMenu={event => instructionMenu(event, i, comments, choose)}
    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(i); } }}>
    <title>{`${i.op} ${i.operands.join(' ')} / CSV ${i.sourceRow}行\n${i.note}${i.difference ? '\n'+differenceLabels[i.difference.kind]+' / 相手側: '+(i.difference.otherText||'なし') : ''}`}</title>
    <SelectionRect phase="frame" className="hit" selected={selected===i.id} hovered={hovered} difference={i.difference?.kind} {...symbolBounds(s,rowHeight,baseline)}/>
    {i.op === 'NOP' ? null : marker ? <>
      <rect class={`command-outline flow-marker ${i.controlFlow?.kind==='loop'?'flow-loop':''}`} x={X(x+6)} y={Y(y-12)} width={X(x+w-6)-X(x+6)} height={Y(y+12)-Y(y-12)}/>
      <text class="command-text" x={x+14} y={y+4}><tspan class={i.difference?.opChanged?'diff-value':''}>{i.op}</tspan>{i.operands.map((operand,index)=><>{' '}<Operand instruction={i} index={index}/></>)}</text>
      {flow&&<text class="flow-note" x={x+14} y={y+26}>{flowArrow}{flow.label}{flow.targetStep!==undefined&&<>{scopeTarget?' ～ ':' → '}{flow.targetId&&navigate?<tspan class="flow-target" role="button" tabIndex={0} aria-label={`STEP ${flow.targetStep||'—'}へ移動`} onClick={event=>{event.stopPropagation();navigate(flow.targetId!);}} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();navigate(flow.targetId!);}}}>STEP {flow.targetStep||'—'}</tspan>:<>STEP {flow.targetStep||'—'}</>}</>}</text>}
    </> : s.fb ? <>
      <rect class="fb-outline" x={X(x)} y={Y(y-22)} width={X(x+w)-X(x)} height={Y(s.fb.rows*rowHeight-8)-Y(y-22)}/>
      <text class="fb-title" x={x+w/2} y={y-5} text-anchor="middle">{s.fb.model.instance} ({s.fb.model.name})</text>
      {line(c,x,rowHeight-8,x+w,rowHeight-8)}
      {s.fb.ports.map(({port,row,input})=><g key={`${input}-${port.definition.id}`} data-instruction-id={port.definition.id} class={`symbol ${selected===port.definition.id?'chosen':''}`} role="button" tabIndex={0}
        onClick={event=>{event.stopPropagation();choose(port.definition);}} onContextMenu={event=>instructionMenu(event,port.definition,comments,choose)}
        onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();choose(port.definition);}}}>
        <title>{port.definition.op}</title>
        <rect class="hit" x={input?x+1:x+w/2} y={row*rowHeight+4} width={w/2-2} height={rowHeight-8}/>
        <text class="fb-pin" x={input?x+8:x+w-8} y={row*rowHeight+baseline-8} text-anchor={input?'start':'end'}>{port.name}</text>
        {showComments&&<CommentText text={deviceComment(`${s.fb!.model.instance}.${port.name}`,comments)} x={input?x+8:x+w/2+8} y={row*rowHeight+baseline+16} width={w/2-16}/>}
      </g>)}
    </> : i.inlineST ? <>
      {line(c,x,y,x+6,y,inputClass)}{line(c,x+w-6,y,x+w,y,outputClass)}
      <rect class="command-outline" x={X(x+6)} y={Y(y-11)} width={X(x+w-6)-X(x+6)} height={Y(y-11+inlineSTHeight(i,s.span))-Y(y-11)}/>
      <text class="command-text" x={x+14} y={y+4}>{i.op}</text>
      <foreignObject x={x+14} y={y+14} width={w-28} height={inlineSTHeight(i,s.span)-28}><pre class="inline-st-code">{inlineSTLines(i,s.span).join('\n')}</pre></foreignObject>
    </> : s.value!==undefined ? <>
      {line(c,x,y,x+w,y,inputClass)}
      <text class={`device fb-binding ${s.valueEnd?'fb-binding-input':''}`} x={s.valueEnd?x+w-8:x+8} y={y-10}><AddressText text={s.value} svg maxLength={s.valueEnd?12:undefined}/></text>
    </> : i.pins ? <>
      {line(c, x, y, x + 10, y,inputClass)}{line(c, x + w - 10, y, x + w, y,outputClass)}
      <rect class="fb-outline" x={X(x + 10)} y={Y(y - 22)} width={X(x + w - 10) - X(x + 10)} height={Y(y + i.pins.length * 22 + 30) - Y(y - 22)}/>
      <text class="fb-title" x={x + 20} y={y - 6}>{i.op.slice(7)}</text>
      {i.pins.map((pin, index) => <g key={pin.id} onContextMenu={event => instructionMenu(event, pin, comments, choose)} onClick={event => { event.stopPropagation(); choose(pin); }}>
        <title>{pin.op + ' ' + pin.operands.join(' ')}</title>
        <text class="fb-pin" x={x + 20} y={y + 24 + index * 22}>{pin.op}</text>
        <text class="fb-value" x={x + w - 20} y={y + 24 + index * 22}>{pin.operands.map((operand, index) => <>{index ? ' ' : ''}<AddressText text={operand} svg/></>)}</text>
      </g>)}
    </> : s.contact && !comparison && !special ? <>
      <LadderGlyph kind="contact" x={x} y={y} width={CELL} c={c} negated={inverse} pulse={pulse<0?'rise':pulse>0?'fall':null} inputClass={inputClass} outputClass={outputClass}/>
      <text class="device" x={cx} y={y - 15}>{i.operands.map((operand, index) => <>{index ? ' ' : ''}<Operand instruction={i} index={index} maxLength={11}/></>)}</text>
    </> : coil ? <>
      <LadderGlyph kind="coil" x={x} y={y} width={CELL} c={c} inputClass={inputClass} outputClass={outputClass}/>
      <text class="device" x={cx} y={y - 15}>{i.operands.map((operand, index) => <>{index ? ' ' : ''}<Operand instruction={i} index={index} maxLength={11}/></>)}</text>
      {i.op === 'OUTH' && <text class="operator" x={cx} y={y + 4}>H</text>}
    </> : i.op === 'INV' ? <>
      <LadderGlyph kind="invert" x={x} y={y} width={CELL} c={c} inputClass={inputClass} outputClass={outputClass}/>
    </> : isInlineLogic(i.op) ? <>
      <LadderGlyph kind="pulse" x={x} y={y} width={CELL} c={c} pulse={i.op.endsWith('P')?'rise':'fall'} inputClass={inputClass} outputClass={outputClass}/>
      {(i.op === 'EGP' || i.op === 'EGF') && <text class="device" x={cx} y={y - 15}>{i.operands.map((operand, index) => <>{index ? ' ' : ''}<Operand instruction={i} index={index} maxLength={11}/></>)}</text>}
    </> : <>
      <LadderGlyph kind={comparison?'comparison':'command'} x={x} y={y} width={w} c={c} inputClass={inputClass} outputClass={outputClass}/>
      <text class="command-text" x={x + 14} y={y + 4}><tspan class={i.difference?.opChanged?'diff-value':''}>{command}</tspan>{i.operands.map((operand,index) => <>{' '}<Operand instruction={i} index={index}/></>)}</text>
    </>}
    {showComments && !s.fb && !i.inlineST && !i.pins && !marker && <CommentText text={description} x={centered ? cx : x + 14} y={y + 20} width={centered ? CELL - 4 : w - 28} centered={centered}/>}
  </g>;
}

export function Ladder({ network, selected, choose, navigate, zoom, rowHeight, comments, showComments, viewMode='wrap' }: { network: Network; selected: string; choose: (i: Instruction) => void; navigate?: (instructionId: string) => void; zoom: number; rowHeight: number; comments: DeviceComments; showComments: boolean; viewMode?:LadderViewMode }) {
  const root = useRef<SVGSVGElement>(null);
  const [raster, setRaster] = useState({ x: 0, y: 0, ratio: 1 });
  const [hovered,setHovered]=useState('');
  function updateRaster() {
    if (!root.current) return;
    const rect = root.current.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const phase = (value: number) => ((value * ratio % 1) + 1) % 1 / ratio;
    const next = { x: phase(rect.x), y: phase(rect.y), ratio };
    setRaster(old => Math.abs(old.x - next.x) < 1e-6 && Math.abs(old.y - next.y) < 1e-6 && old.ratio === ratio ? old : next);
  }
  useLayoutEffect(updateRaster);
  useLayoutEffect(() => {
    const scroller = root.current?.closest('.network-scroll');
    if (!scroller) return;
    scroller.addEventListener('scroll', updateRaster, { passive: true });
    return () => scroller.removeEventListener('scroll', updateRaster);
  }, [network, viewMode]);
  const g = displayGrid(network, viewMode), dimensions = networkSize(network, rowHeight, viewMode), metrics = drawingMetrics(network, rowHeight), notes = noteLayout(network, viewMode);
  rowHeight = metrics.rowHeight;
  const baseline = metrics.baseline;
  const scrolling = viewMode === 'scroll' && g.pages > 1;
  const markerOnly = !g.wires.length && g.symbols.length > 0 && g.symbols.every(s => isControlMarker(s.instruction.op));
  const master = network.masterControl, masterY = (network.rowAlignment?.[0] ?? 0) * rowHeight;
  const pointerRow = network.masterControl ? 1 : 0;
  const pointerY = (network.rowAlignment?.[pointerRow] ?? pointerRow) * rowHeight;
  const rootStroke = strokeCoordinates(zoom, raster.ratio, raster.x, raster.y);
  const rootRail = strokeCoordinates(zoom, raster.ratio, raster.x, raster.y, 2);
  return <svg ref={root} width={dimensions.width * zoom} height={dimensions.height * zoom} viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
    style={{ '--drawing-stroke': `${rootStroke.width}px`, '--drawing-rail': `${rootRail.width}px` }} aria-label={`回路 ステップ${network.step}`}>
    {master && <g class={`symbol ${master.difference ? 'diff-' + master.difference.kind : ''} ${selected === master.id ? 'chosen' : ''}`} role="button" tabIndex={0} aria-label={`MC ${master.operands.join(' ')}`} onClick={() => choose(master)} onContextMenu={event => instructionMenu(event, master, comments, choose)} onKeyDown={event => { if(event.key === 'Enter' || event.key === ' ') {event.preventDefault();choose(master);} }}>
      <title>{`MC ${master.operands.join(' ')}`}</title>
      <rect class="hit" x={2} y={masterY + 4} width={LEFT_GUTTER + CELL * 2 - 4} height={rowHeight - 8}/>
      <text class="step-label" x={LEFT_GUTTER - 10} y={masterY + baseline + 4}><Operand instruction={master} index={0}/></text>
      <text class="pointer-label" x={LEFT_GUTTER + 10} y={masterY + baseline + 4}>{master.operands.slice(1).map((operand, index) => <>{index ? ' ' : ''}<Operand instruction={master} index={index + 1}/></>)}</text>
      {showComments && <CommentText text={deviceComment(master.operands[1], comments)} x={LEFT_GUTTER + 10} y={masterY + baseline + 20} width={CELL * 2 - 20}/>}
      {line(rootStroke, LEFT_GUTTER - 6, masterY + baseline - 9, LEFT_GUTTER + 6, masterY + baseline - 9)}
      {line(rootStroke, LEFT_GUTTER - 6, masterY + baseline + 9, LEFT_GUTTER + 6, masterY + baseline + 9)}
    </g>}
    {network.pointer && <g data-instruction-id={network.pointer.id} class={`symbol ${network.pointer.difference?'diff-'+network.pointer.difference.kind:''} ${selected === network.pointer.id ? 'chosen' : ''}`} transform={`translate(0 ${pointerY})`} role="button" tabIndex={0} aria-label={network.pointer.op} onContextMenu={event => instructionMenu(event, network.pointer!, comments, choose)} onClick={() => choose(network.pointer!)} onKeyDown={e => { if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(network.pointer!); } }}>
      <rect class="hit" x={2} y={4} width={LEFT_GUTTER - 27} height={rowHeight - 8}/>
      <text class="pointer-label" x={6} y={baseline + 4}>{network.pointer.op}</text>
      {showComments && <CommentText text={deviceComment(network.pointer.op, comments)} x={6} y={baseline + 20} width={LEFT_GUTTER - 28}/>}
    </g>}
    {!markerOnly && line(rootRail, dimensions.width - 8, 0, dimensions.width - 8, dimensions.height, 'rail right-rail')}
    {drawingPages(g, rowHeight, viewMode).map(({page,left,top,width,outputs}) => {
      const clip = `clip-${network.id}-${page}`;
      const c = strokeCoordinates(zoom, raster.ratio, raster.x + (LEFT_GUTTER - left) * zoom, raster.y + top * zoom);
      const rail = strokeCoordinates(zoom, raster.ratio, raster.x + LEFT_GUTTER * zoom, raster.y + top * zoom, 2);
      const endStroke = strokeCoordinates(zoom, raster.ratio, raster.x + LEFT_GUTTER * zoom, raster.y + top * zoom);
      return <g transform={`translate(${LEFT_GUTTER} ${top})`} key={page}>
        <defs><clipPath id={clip}><rect x={0} y={0} width={width} height={g.rows * rowHeight}/></clipPath></defs>
        {page === 0 && !markerOnly && (master ? <>
          {line(rail,0,0,0,masterY+baseline-9,'rail left-rail')}
          {line(rail,0,masterY+baseline+9,0,g.rows*rowHeight,'rail left-rail')}
        </> : line(rail,0,0,0,g.rows*rowHeight,'rail left-rail'))}
        {outputs.map(s => line(endStroke, scrolling ? (s.col + s.span) * CELL : width, s.row * rowHeight + baseline, width + 8, s.row * rowHeight + baseline, 'wire'))}
        <g clip-path={`url(#${clip})`}><g transform={`translate(${-left} 0)`}>
          <g pointer-events="none">{g.symbols.map(s=><SelectionRect key={s.instruction.id} phase="background" selected={selected===s.instruction.id} hovered={hovered===s.instruction.id} difference={s.instruction.difference?.kind} {...symbolBounds(s,rowHeight,baseline)}/>)}</g>
          {g.wires.map(w => line(c, w.x1 * CELL, w.y1 * rowHeight + baseline, w.x2 * CELL, w.y2 * rowHeight + baseline,w.difference?`wire wire-${w.difference}`:'wire'))}
          {g.symbols.map(s => <Symbol key={s.instruction.id} s={s} selected={selected} hovered={hovered===s.instruction.id} hover={setHovered} choose={choose} navigate={navigate} c={c} rowHeight={rowHeight} baseline={baseline} comments={comments} showComments={showComments}/>)}
        </g></g>
        {notes.filter(note=>note.pointer?page===0:note.col*CELL>=left&&note.col*CELL<left+width).map(note=><foreignObject key={note.owner.id} data-note-instruction-ids={note.instructions.map(i=>i.id).join(' ')} x={note.pointer?-LEFT_GUTTER+6:note.col*CELL-left+6} y={note.row*rowHeight+metrics.padding+note.top} width={note.pointer?LEFT_GUTTER-28:note.owner.inlineST?note.span*CELL-12:Math.min(3*CELL,note.span*CELL-12)} height={note.lines.length*NOTE_LINE_HEIGHT}>
          <div class={`network-statements network-notes instruction-notes ${note.owner.inlineST?'inline-st-notes':''}`}>{note.lines.map((text,index)=><div key={index} class="network-title network-note" title={text}>{text}</div>)}</div>
        </foreignObject>)}
        {g.symbols.filter(s => s.col * CELL >= left && s.col * CELL < left + width)
          .filter((s, index, all) => all.findIndex(other => other.row === s.row) === index)
          .map(s => <text class={`step-label ${s.instruction.difference?.kind==='step'?'step-difference':''}`} x={-9} y={s.row * rowHeight + baseline + 4}>{network.pointer && page === 0 && s.row === (network.rowAlignment?.[pointerRow] ?? pointerRow) ? network.pointer.step : s.instruction.step}</text>)}
        {page===0&&network.pointer&&!g.symbols.some(s=>s.row*rowHeight===pointerY)&&<text class={`step-label ${network.pointer.difference?.kind==='step'?'step-difference':''}`} x={-9} y={pointerY+baseline+4}>{network.pointer.step}</text>}
        {!scrolling && g.pages > 1 && <text class="continuation" x={8} y={g.rows * rowHeight + 15}>{continuationText(page,g.pages)}</text>}
      </g>;
    })}
  </svg>;
}
