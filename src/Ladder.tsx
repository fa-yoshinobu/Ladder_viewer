import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { differenceLabels, type Instruction, type Network } from './model';
import { AddressText } from './AddressText';
import { CommentText } from './CommentText';
import { deviceComment, type DeviceComments } from './comments';
import { strokeCoordinates, type StrokeCoordinates } from './drawing';
import { CELL, ROW, GRID_WIDTH, COLUMNS, BASELINE, LEFT_GUTTER, PAGE_GAP, gridLayout, networkSize, isCoil, type GridSymbol } from './layout';

const line = (c: StrokeCoordinates, x1: number, y1: number, x2: number, y2: number, className = 'wire') =>
  <line x1={c.x(x1)} y1={c.y(y1)} x2={c.x(x2)} y2={c.y(y2)} class={className}/>;

function Operand({instruction,index,maxLength}:{instruction:Instruction;index:number;maxLength?:number}) {
 return <tspan class={instruction.difference?.operandChanges.includes(index)?'diff-value':''}><AddressText text={instruction.operands[index]} svg maxLength={maxLength}/></tspan>;
}
function Symbol({ s, selected, choose, c, rowHeight, comments, showComments }: { s: GridSymbol; selected: string; choose: (i: Instruction) => void; c: StrokeCoordinates; rowHeight: number; comments: DeviceComments; showComments: boolean }) {
  const i = s.instruction;
  const x = s.col * CELL, y = s.row * rowHeight + BASELINE, w = s.span * CELL, cx = x + CELL / 2;
  const X = c.x, Y = c.y;
  const coil = !s.contact && isCoil(i);
  const comparison = s.contact && /[=<>]/.test(i.op);
  const inverse = /^(LDI|ANI|ORI|LDPI|ANDPI|ORPI|LDFI|ANDFI|ORFI)$/.test(i.op);
  const pulse = /PI?$/.test(i.op) ? -1 : /FI?$/.test(i.op) ? 1 : 0;
  const special = s.contact && /^(INV|MEP|MEF)$/.test(i.op);
  const command = comparison ? i.op.replace(/^(LD|AND|OR)/, '') : i.op;
  const radius = Math.round(7 * c.scale) / c.scale;
  const labels = i.operands.map(operand => ({ operand, text: deviceComment(operand, comments) })).filter(item => item.text);
  const description = labels.length > 1 ? labels.map(item => `${item.operand}: ${item.text}`).join(' / ') : labels[0]?.text ?? '';
  return <g class={`symbol ${i.difference?'diff-'+i.difference.kind:''} ${selected === i.id ? 'chosen' : ''}`} role="button" tabIndex={0}
    aria-label={`${i.op} ${i.operands.join(' ')}`} onClick={() => choose(i)}
    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(i); } }}>
    <title>{`${i.op} ${i.operands.join(' ')} / CSV ${i.sourceRow}行\n${i.note}${i.difference ? '\n'+differenceLabels[i.difference.kind]+' / 相手側: '+(i.difference.otherText||'なし') : ''}`}</title>
    <rect class="hit" x={x + 1} y={y - 24} width={w - 2} height={i.pins ? i.pins.length * 22 + 54 : rowHeight - 8} rx={2}/>
    {i.pins ? <>
      {line(c, x, y, x + 10, y)}{line(c, x + w - 10, y, x + w, y)}
      <rect class="fb-outline" x={X(x + 10)} y={Y(y - 22)} width={X(x + w - 10) - X(x + 10)} height={Y(y + i.pins.length * 22 + 30) - Y(y - 22)}/>
      <text class="fb-title" x={x + 20} y={y - 6}>{i.op.slice(7)}</text>
      {i.pins.map((pin, index) => <g key={pin.id} onClick={event => { event.stopPropagation(); choose(pin); }}>
        <title>{pin.op + ' ' + pin.operands.join(' ')}</title>
        <text class="fb-pin" x={x + 20} y={y + 24 + index * 22}>{pin.op}</text>
        <text class="fb-value" x={x + w - 20} y={y + 24 + index * 22}>{pin.operands.map((operand, index) => <>{index ? ' ' : ''}<AddressText text={operand} svg/></>)}</text>
      </g>)}
    </> : s.contact && !comparison && !special ? <>
      {line(c, x, y, cx - 7, y)}{line(c, cx + 7, y, x + CELL, y)}
      <path class="contact" d={`M${X(cx - 7)},${Y(y - 7)}V${Y(y + 7)} M${X(cx + 7)},${Y(y - 7)}V${Y(y + 7)}`}/>
      {inverse && <path class="contact" d={`M${X(cx - 10)},${Y(y + 7)}L${X(cx + 10)},${Y(y - 7)}`}/>}
      {pulse !== 0 && <path class="contact" d={`M${X(cx)},${Y(y - pulse * 6)}V${Y(y + pulse * 7)} M${X(cx - 4)},${Y(y + pulse * 3)}L${X(cx)},${Y(y + pulse * 7)}L${X(cx + 4)},${Y(y + pulse * 3)}`}/>}
      <text class="device" x={cx} y={y - 15}>{i.operands.map((operand, index) => <>{index ? ' ' : ''}<Operand instruction={i} index={index} maxLength={11}/></>)}</text>
    </> : coil ? <>
      <line class="wire" x1={X(x)} y1={Y(y)} x2={X(cx) - radius} y2={Y(y)}/>
      <line class="wire" x1={X(cx) + radius} y1={Y(y)} x2={X(x + CELL)} y2={Y(y)}/>
      <circle class="contact coil" cx={X(cx)} cy={Y(y)} r={radius}/>
      <text class="device" x={cx} y={y - 15}>{i.operands.map((operand, index) => <>{index ? ' ' : ''}<Operand instruction={i} index={index} maxLength={11}/></>)}</text>
      {i.op === 'OUTH' && <text class="operator" x={cx} y={y + 4}>H</text>}
    </> : i.op === 'INV' ? <>
      {line(c, x, y, x + CELL, y)}<path class="contact inv-mark" d={`M${X(cx - 10)},${Y(y + 7)}L${X(cx + 10)},${Y(y - 7)}`}/>
    </> : i.op === 'MEP' || i.op === 'MEF' ? <>
      {line(c, x, y, x + CELL, y)}
      <path class="contact" d={`M${X(cx)},${Y(y)}V${Y(y + (i.op === 'MEP' ? -7 : 7))} M${X(cx - 4)},${Y(y + (i.op === 'MEP' ? -3 : 3))}L${X(cx)},${Y(y + (i.op === 'MEP' ? -7 : 7))}L${X(cx + 4)},${Y(y + (i.op === 'MEP' ? -3 : 3))}`}/>
    </> : <>
      {line(c, x, y, x + 6, y)}{line(c, x + w - 6, y, x + w, y)}
      {comparison
        ? <path class="command-outline" d={`M${X(x + 12)},${Y(y - 10)}H${X(x + 6)}V${Y(y + 10)}H${X(x + 12)} M${X(x + w - 12)},${Y(y - 10)}H${X(x + w - 6)}V${Y(y + 10)}H${X(x + w - 12)}`}/>
        : <rect class="command-outline" x={X(x + 6)} y={Y(y - 11)} width={X(x + w - 6) - X(x + 6)} height={Y(y + 11) - Y(y - 11)}/>}
      <text class="command-text" x={x + 14} y={y + 4}><tspan class={i.difference?.opChanged?'diff-value':''}>{command}</tspan>{i.operands.map((operand,index) => <>{' '}<Operand instruction={i} index={index}/></>)}</text>
    </>}
    {showComments && !i.pins && <CommentText text={description} x={s.contact && !comparison || coil ? cx : x + 14} y={y + 20} width={s.contact && !comparison || coil ? CELL - 4 : w - 28} centered={s.contact && !comparison || coil}/>}
  </g>;
}

export function Ladder({ network, selected, choose, zoom, rowHeight, comments, showComments }: { network: Network; selected: string; choose: (i: Instruction) => void; zoom: number; rowHeight: number; comments: DeviceComments; showComments: boolean }) {
  const root = useRef<SVGSVGElement>(null);
  const [raster, setRaster] = useState({ x: 0, y: 0, ratio: 1 });
  useLayoutEffect(() => {
    if (!root.current) return;
    const rect = root.current.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const phase = (value: number) => ((value * ratio % 1) + 1) % 1 / ratio;
    const next = { x: phase(rect.x), y: phase(rect.y), ratio };
    setRaster(old => Math.abs(old.x - next.x) < 1e-6 && Math.abs(old.y - next.y) < 1e-6 && old.ratio === ratio ? old : next);
  });
  const g = gridLayout(network), dimensions = networkSize(network, rowHeight), pageHeight = g.rows * rowHeight + PAGE_GAP;
  const rootStroke = strokeCoordinates(zoom, raster.ratio, raster.x, raster.y);
  const rootRail = strokeCoordinates(zoom, raster.ratio, raster.x, raster.y, 2);
  return <svg ref={root} width={g.width * zoom} height={dimensions.height * zoom} viewBox={`0 0 ${g.width} ${dimensions.height}`}
    style={{ '--drawing-stroke': `${rootStroke.width}px`, '--drawing-rail': `${rootRail.width}px` }} aria-label={`回路 ステップ${network.step}`}>
    {network.pointer && <g class={`symbol ${network.pointer.difference?'diff-'+network.pointer.difference.kind:''} ${selected === network.pointer.id ? 'chosen' : ''}`} role="button" tabIndex={0} aria-label={network.pointer.op} onClick={() => choose(network.pointer!)} onKeyDown={e => { if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(network.pointer!); } }}>
      <rect class="hit" x={2} y={4} width={LEFT_GUTTER - 27} height={rowHeight - 8}/>
      <text class="pointer-label" x={6} y={BASELINE + 4}>{network.pointer.op}</text>
      {showComments && <CommentText text={deviceComment(network.pointer.op, comments)} x={6} y={BASELINE + 20} width={LEFT_GUTTER - 28}/>}
    </g>}
    {line(rootRail, LEFT_GUTTER + GRID_WIDTH + 8, 0, LEFT_GUTTER + GRID_WIDTH + 8, dimensions.height, 'rail right-rail')}
    {Array.from({ length: g.pages }, (_, page) => {
      const clip = `clip-${network.id}-${page}`, left = page * GRID_WIDTH;
      const pageY = page * pageHeight;
      const c = strokeCoordinates(zoom, raster.ratio, raster.x + (LEFT_GUTTER - left) * zoom, raster.y + pageY * zoom);
      const rail = strokeCoordinates(zoom, raster.ratio, raster.x + LEFT_GUTTER * zoom, raster.y + pageY * zoom, 2);
      const endStroke = strokeCoordinates(zoom, raster.ratio, raster.x + LEFT_GUTTER * zoom, raster.y + pageY * zoom);
      return <g transform={`translate(${LEFT_GUTTER} ${pageY})`} key={page}>
        <defs><clipPath id={clip}><rect x={0} y={0} width={GRID_WIDTH} height={g.rows * rowHeight}/></clipPath></defs>
        {page === 0 && line(rail, 0, 0, 0, g.rows * rowHeight, 'rail left-rail')}
        {g.symbols.filter(s => !s.contact && s.col + s.span === (page + 1) * COLUMNS).map(s => line(endStroke, GRID_WIDTH, s.row * rowHeight + BASELINE, GRID_WIDTH + 8, s.row * rowHeight + BASELINE))}
        <g clip-path={`url(#${clip})`}><g transform={`translate(${-left} 0)`}>
          {g.wires.map(w => line(c, w.x1 * CELL, w.y1 * rowHeight + BASELINE, w.x2 * CELL, w.y2 * rowHeight + BASELINE))}
          {g.symbols.map(s => <Symbol key={s.instruction.id} s={s} selected={selected} choose={choose} c={c} rowHeight={rowHeight} comments={comments} showComments={showComments}/>)}
        </g></g>
        {g.symbols.filter(s => s.col >= page * COLUMNS && s.col < (page + 1) * COLUMNS)
          .filter((s, index, all) => all.findIndex(other => other.row === s.row) === index)
          .map(s => <text class={`step-label ${s.instruction.difference?.kind==='step'?'step-difference':''}`} x={-9} y={s.row * rowHeight + BASELINE + 4}>{s.instruction.step}</text>)}
        {g.pages > 1 && <text class="continuation" x={8} y={g.rows * rowHeight + 15}>{page + 1} / {g.pages} 段{page + 1 < g.pages ? '　→ 次段へ接続' : ''}{page > 0 ? '　（前段からの続き）' : ''}</text>}
      </g>;
    })}
  </svg>;
}
