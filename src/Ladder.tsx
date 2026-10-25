import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { differenceLabels, type Instruction, type Network } from './model';
import { AddressText } from './AddressText';
import { nativeCsvBridge } from './nativeCsv';
import { instructionCopyText } from './instructionCopy';
import { isComparisonCondition, isInlineLogic } from './instructions';
import { CommentText } from './CommentText';
import { deviceComment, type DeviceComments } from './comments';
import { strokeCoordinates, type StrokeCoordinates } from './drawing';
import { CELL, BASELINE, LEFT_GUTTER, displayGrid, networkSize, drawingPages, isCoil, type GridSymbol, type LadderViewMode } from './layout';

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
function Symbol({ s, selected, choose, c, rowHeight, comments, showComments }: { s: GridSymbol; selected: string; choose: (i: Instruction) => void; c: StrokeCoordinates; rowHeight: number; comments: DeviceComments; showComments: boolean }) {
  const i = s.instruction;
  const x = s.col * CELL, y = s.row * rowHeight + BASELINE, w = s.span * CELL, cx = x + CELL / 2;
  const X = c.x, Y = c.y;
  const inputClass=s.inputDifference?`wire wire-${s.inputDifference}`:'wire';
  const outputClass=s.outputDifference?`wire wire-${s.outputDifference}`:'wire';
  const coil = !s.contact && isCoil(i);
  const comparison = s.contact && isComparisonCondition(i.op);
  const inverse = /^(LDI|ANI|ORI|LDPI|ANDPI|ORPI|LDFI|ANDFI|ORFI)$/.test(i.op);
  const pulse = /PI?$/.test(i.op) ? -1 : /FI?$/.test(i.op) ? 1 : 0;
  const special = s.contact && (isInlineLogic(i.op) || i.op === 'PHASE');
  const centered = (s.contact && !comparison && i.op !== 'PHASE') || coil;
  const command = comparison ? i.op.replace(/^(LD|AND|OR)/, '') : i.op;
  const radius = Math.round(7 * c.scale) / c.scale;
  const labels = i.operands.map(operand => ({ operand, text: deviceComment(operand, comments) })).filter(item => item.text);
  const description = labels.length > 1 ? labels.map(item => `${item.operand}: ${item.text}`).join(' / ') : labels[0]?.text ?? '';
  return <g class={`symbol ${i.difference?'diff-'+i.difference.kind:''} ${selected === i.id ? 'chosen' : ''}`} role="button" tabIndex={0}
    aria-label={`${i.op} ${i.operands.join(' ')}`} onClick={() => choose(i)} onContextMenu={event => instructionMenu(event, i, comments, choose)}
    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(i); } }}>
    <title>{`${i.op} ${i.operands.join(' ')} / CSV ${i.sourceRow}行\n${i.note}${i.difference ? '\n'+differenceLabels[i.difference.kind]+' / 相手側: '+(i.difference.otherText||'なし') : ''}`}</title>
    <rect class="hit" x={x + 1} y={y - 24} width={w - 2} height={i.pins ? i.pins.length * 22 + 54 : rowHeight - 8} rx={2}/>
    {i.op === 'NOP' ? null : i.pins ? <>
      {line(c, x, y, x + 10, y,inputClass)}{line(c, x + w - 10, y, x + w, y,outputClass)}
      <rect class="fb-outline" x={X(x + 10)} y={Y(y - 22)} width={X(x + w - 10) - X(x + 10)} height={Y(y + i.pins.length * 22 + 30) - Y(y - 22)}/>
      <text class="fb-title" x={x + 20} y={y - 6}>{i.op.slice(7)}</text>
      {i.pins.map((pin, index) => <g key={pin.id} onContextMenu={event => instructionMenu(event, pin, comments, choose)} onClick={event => { event.stopPropagation(); choose(pin); }}>
        <title>{pin.op + ' ' + pin.operands.join(' ')}</title>
        <text class="fb-pin" x={x + 20} y={y + 24 + index * 22}>{pin.op}</text>
        <text class="fb-value" x={x + w - 20} y={y + 24 + index * 22}>{pin.operands.map((operand, index) => <>{index ? ' ' : ''}<AddressText text={operand} svg/></>)}</text>
      </g>)}
    </> : s.contact && !comparison && !special ? <>
      {line(c, x, y, cx - 7, y,inputClass)}{line(c, cx + 7, y, x + CELL, y,outputClass)}
      <path class="contact" d={`M${X(cx - 7)},${Y(y - 7)}V${Y(y + 7)} M${X(cx + 7)},${Y(y - 7)}V${Y(y + 7)}`}/>
      {inverse && <path class="contact" d={`M${X(cx - 10)},${Y(y + 7)}L${X(cx + 10)},${Y(y - 7)}`}/>}
      {pulse !== 0 && <path class="contact" d={`M${X(cx)},${Y(y - pulse * 6)}V${Y(y + pulse * 7)} M${X(cx - 4)},${Y(y + pulse * 3)}L${X(cx)},${Y(y + pulse * 7)}L${X(cx + 4)},${Y(y + pulse * 3)}`}/>}
      <text class="device" x={cx} y={y - 15}>{i.operands.map((operand, index) => <>{index ? ' ' : ''}<Operand instruction={i} index={index} maxLength={11}/></>)}</text>
    </> : coil ? <>
      <line class={inputClass} x1={X(x)} y1={Y(y)} x2={X(cx) - radius} y2={Y(y)}/>
      <line class={outputClass} x1={X(cx) + radius} y1={Y(y)} x2={X(x + CELL)} y2={Y(y)}/>
      <circle class="contact coil" cx={X(cx)} cy={Y(y)} r={radius}/>
      <text class="device" x={cx} y={y - 15}>{i.operands.map((operand, index) => <>{index ? ' ' : ''}<Operand instruction={i} index={index} maxLength={11}/></>)}</text>
      {i.op === 'OUTH' && <text class="operator" x={cx} y={y + 4}>H</text>}
    </> : i.op === 'INV' ? <>
      {line(c, x, y, cx, y,inputClass)}{line(c,cx,y,x+CELL,y,outputClass)}<path class="contact inv-mark" d={`M${X(cx - 10)},${Y(y + 7)}L${X(cx + 10)},${Y(y - 7)}`}/>
    </> : isInlineLogic(i.op) ? <>
      {line(c, x, y, cx, y,inputClass)}{line(c,cx,y,x+CELL,y,outputClass)}
      <path class="contact" d={`M${X(cx)},${Y(y)}V${Y(y + (i.op.endsWith('P') ? -7 : 7))} M${X(cx - 4)},${Y(y + (i.op.endsWith('P') ? -3 : 3))}L${X(cx)},${Y(y + (i.op.endsWith('P') ? -7 : 7))}L${X(cx + 4)},${Y(y + (i.op.endsWith('P') ? -3 : 3))}`}/>
      {(i.op === 'EGP' || i.op === 'EGF') && <text class="device" x={cx} y={y - 15}>{i.operands.map((operand, index) => <>{index ? ' ' : ''}<Operand instruction={i} index={index} maxLength={11}/></>)}</text>}
    </> : <>
      {line(c, x, y, x + 6, y,inputClass)}{line(c, x + w - 6, y, x + w, y,outputClass)}
      {comparison
        ? <path class="command-outline" d={`M${X(x + 12)},${Y(y - 10)}H${X(x + 6)}V${Y(y + 10)}H${X(x + 12)} M${X(x + w - 12)},${Y(y - 10)}H${X(x + w - 6)}V${Y(y + 10)}H${X(x + w - 12)}`}/>
        : <rect class="command-outline" x={X(x + 6)} y={Y(y - 11)} width={X(x + w - 6) - X(x + 6)} height={Y(y + 11) - Y(y - 11)}/>}
      <text class="command-text" x={x + 14} y={y + 4}><tspan class={i.difference?.opChanged?'diff-value':''}>{command}</tspan>{i.operands.map((operand,index) => <>{' '}<Operand instruction={i} index={index}/></>)}</text>
    </>}
    {showComments && !i.pins && <CommentText text={description} x={centered ? cx : x + 14} y={y + 20} width={centered ? CELL - 4 : w - 28} centered={centered}/>}
  </g>;
}

export function Ladder({ network, selected, choose, zoom, rowHeight, comments, showComments, viewMode='wrap' }: { network: Network; selected: string; choose: (i: Instruction) => void; zoom: number; rowHeight: number; comments: DeviceComments; showComments: boolean; viewMode?:LadderViewMode }) {
  const root = useRef<SVGSVGElement>(null);
  const [raster, setRaster] = useState({ x: 0, y: 0, ratio: 1 });
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
  const g = displayGrid(network, viewMode), dimensions = networkSize(network, rowHeight, viewMode);
  const scrolling = viewMode === 'scroll' && g.pages > 1;
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
      <text class="step-label" x={LEFT_GUTTER - 10} y={masterY + BASELINE + 4}><Operand instruction={master} index={0}/></text>
      <text class="pointer-label" x={LEFT_GUTTER + 10} y={masterY + BASELINE + 4}>{master.operands.slice(1).map((operand, index) => <>{index ? ' ' : ''}<Operand instruction={master} index={index + 1}/></>)}</text>
      {showComments && <CommentText text={deviceComment(master.operands[1], comments)} x={LEFT_GUTTER + 10} y={masterY + BASELINE + 20} width={CELL * 2 - 20}/>}
      {line(rootStroke, LEFT_GUTTER - 6, masterY + BASELINE - 9, LEFT_GUTTER + 6, masterY + BASELINE - 9)}
      {line(rootStroke, LEFT_GUTTER - 6, masterY + BASELINE + 9, LEFT_GUTTER + 6, masterY + BASELINE + 9)}
    </g>}
    {network.pointer && <g class={`symbol ${network.pointer.difference?'diff-'+network.pointer.difference.kind:''} ${selected === network.pointer.id ? 'chosen' : ''}`} transform={`translate(0 ${pointerY})`} role="button" tabIndex={0} aria-label={network.pointer.op} onContextMenu={event => instructionMenu(event, network.pointer!, comments, choose)} onClick={() => choose(network.pointer!)} onKeyDown={e => { if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(network.pointer!); } }}>
      <rect class="hit" x={2} y={4} width={LEFT_GUTTER - 27} height={rowHeight - 8}/>
      <text class="pointer-label" x={6} y={BASELINE + 4}>{network.pointer.op}</text>
      {showComments && <CommentText text={deviceComment(network.pointer.op, comments)} x={6} y={BASELINE + 20} width={LEFT_GUTTER - 28}/>}
    </g>}
    {line(rootRail, dimensions.width - 8, 0, dimensions.width - 8, dimensions.height, 'rail right-rail')}
    {drawingPages(g, rowHeight, viewMode).map(({page,left,top,width,outputs}) => {
      const clip = `clip-${network.id}-${page}`;
      const c = strokeCoordinates(zoom, raster.ratio, raster.x + (LEFT_GUTTER - left) * zoom, raster.y + top * zoom);
      const rail = strokeCoordinates(zoom, raster.ratio, raster.x + LEFT_GUTTER * zoom, raster.y + top * zoom, 2);
      const endStroke = strokeCoordinates(zoom, raster.ratio, raster.x + LEFT_GUTTER * zoom, raster.y + top * zoom);
      return <g transform={`translate(${LEFT_GUTTER} ${top})`} key={page}>
        <defs><clipPath id={clip}><rect x={0} y={0} width={width} height={g.rows * rowHeight}/></clipPath></defs>
        {page === 0 && (master ? <>
          {line(rail,0,0,0,masterY+BASELINE-9,'rail left-rail')}
          {line(rail,0,masterY+BASELINE+9,0,g.rows*rowHeight,'rail left-rail')}
        </> : line(rail,0,0,0,g.rows*rowHeight,'rail left-rail'))}
        {outputs.map(s => line(endStroke, scrolling ? (s.col + s.span) * CELL : width, s.row * rowHeight + BASELINE, width + 8, s.row * rowHeight + BASELINE, 'wire'))}
        <g clip-path={`url(#${clip})`}><g transform={`translate(${-left} 0)`}>
          {g.wires.map(w => line(c, w.x1 * CELL, w.y1 * rowHeight + BASELINE, w.x2 * CELL, w.y2 * rowHeight + BASELINE,w.difference?`wire wire-${w.difference}`:'wire'))}
          {g.symbols.map(s => <Symbol key={s.instruction.id} s={s} selected={selected} choose={choose} c={c} rowHeight={rowHeight} comments={comments} showComments={showComments}/>)}
        </g></g>
        {g.symbols.filter(s => s.col * CELL >= left && s.col * CELL < left + width)
          .filter((s, index, all) => all.findIndex(other => other.row === s.row) === index)
          .map(s => <text class={`step-label ${s.instruction.difference?.kind==='step'?'step-difference':''}`} x={-9} y={s.row * rowHeight + BASELINE + 4}>{network.pointer && page === 0 && s.row === (network.rowAlignment?.[pointerRow] ?? pointerRow) ? network.pointer.step : s.instruction.step}</text>)}
        {!scrolling && g.pages > 1 && <text class="continuation" x={8} y={g.rows * rowHeight + 15}>{page + 1} / {g.pages} 段{page + 1 < g.pages ? '　→ 次段へ接続' : ''}{page > 0 ? '　（前段からの続き）' : ''}</text>}
      </g>;
    })}
  </svg>;
}
