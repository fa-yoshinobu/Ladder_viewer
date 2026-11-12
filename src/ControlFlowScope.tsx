import type { Instruction, Network } from './model';
import type { ControlRange } from './controlFlow';
import { drawingMetrics, COLUMNS, drawingPages, displayGrid, type LadderViewMode } from './layout';

export function ControlFlowScope({
  network,
  zoom,
  rowHeight,
  viewMode,
  width,
  height,
  prefix,
  ranges,
  continuationOnly = false,
}: {
  network: Network;
  zoom: number;
  rowHeight: number;
  viewMode: LadderViewMode;
  width: number;
  height: number;
  prefix: number;
  ranges?: ControlRange[];
  continuationOnly?: boolean;
}) {
  const metrics = drawingMetrics(network, rowHeight);
  rowHeight = metrics.rowHeight;
  const grid = continuationOnly ? undefined : displayGrid(network, viewMode),
    scrolling = viewMode === 'scroll' && !!grid && grid.pages > 1;
  const position = (instruction: Instruction | undefined) => {
    if (!grid) return undefined;
    const symbol =
      instruction && grid.symbols.find((symbol) => symbol.instruction.id === instruction.id);
    if (!symbol) return undefined;
    const page = scrolling ? 0 : Math.floor(symbol.col / COLUMNS);
    return (
      prefix +
      (drawingPages(grid, rowHeight, viewMode)[page].top +
        symbol.row * rowHeight +
        metrics.baseline +
        12) *
        zoom
    );
  };
  const clamp = (value: number) => Math.max(0, Math.min(height, value));
  return (
    <svg
      class="control-flow-scope"
      width={width}
      height={height}
      style={{ pointerEvents: 'none' }}
      aria-label="制御構造の範囲"
    >
      {(ranges ?? network.controlRanges)?.map((range) => {
        const loop = range.kind !== 'IF' && range.kind !== 'CASE';
        const start = position(range.start),
          end = position(range.end);
        const top = clamp(start ?? 0),
          bottom = clamp(end ?? height),
          x = (22 + range.lane * 7) * zoom,
          cap = 7 * zoom;
        const label = `${range.kind} 開始STEP ${range.start.step || '—'} → ${range.end ? `終了STEP ${range.end.step || '—'}` : '終端未確認'}`;
        const arrow = 3 * zoom,
          hook = 5 * zoom;
        return (
          <g
            key={range.start.id}
            class={`control-flow-range${loop ? ' control-flow-loop' : ''}${range.end ? '' : ' control-flow-open'}`}
          >
            <title>{label}</title>
            <path
              d={`M${x},${top}V${bottom}${start !== undefined ? ` M${x},${top}H${x + cap}` : ''}${end !== undefined ? ` M${x + cap},${bottom}H${x}${loop ? `V${Math.max(top, bottom - hook)}` : ''}` : ''}`}
            />
            {loop && start !== undefined && (
              <path
                class="control-flow-return"
                d={`M${x - arrow},${top + hook}L${x},${top}L${x + arrow},${top + hook}`}
              />
            )}
            {range.branches.map((branch) => {
              const y = position(branch);
              if (y === undefined || y < 0 || y > height) return null;
              return (
                <g key={branch.id} class="control-flow-branch">
                  <title>{`${range.kind} ${branch.op} STEP ${branch.step || '—'}`}</title>
                  <path d={`M${x},${y}H${x + cap}`} />
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
