import type { Program, Instruction } from './model';
import { CommentListContext } from './CommentList';
import { mitsubishiCommentList, type CommentListData } from './commentListData';
import type { DeviceComments } from './comments';
import type { DirectBlock, DirectInstruction } from './directDrawing';
import { deviceComment } from './comments';
import { instructionCopyText } from './instructionCopy';
import { pairNetworks } from './comparison';
import { CELL, COLUMNS, LEFT_GUTTER, ROW, displayGrid, type LadderViewMode } from './layout';
import { NetworkDrawing, drawingHeight, instructionDrawingOffset } from './NetworkDrawing';
export const projectMitsubishiInstruction = (
  i: Instruction,
  comments: DeviceComments,
): DirectInstruction => ({
  id: i.id,
  op: i.op,
  operands: i.operands,
  line: 'STEP ' + (i.step || '—'),
  step: i.step,
  row: i.comparisonRow,
  controlFlow: i.controlFlow,
  statement: [i.statement, i.piStatement ?? ''].filter(Boolean).join('\n'),
  comment: [
    ...new Set([i.op, ...i.operands].map((v) => deviceComment(v, comments)).filter(Boolean)),
    i.note,
    i.inlineST?.text ?? '',
  ]
    .filter(Boolean)
    .join('\n'),
  copyText: instructionCopyText(i, comments),
  difference: i.difference,
});
export function mitsubishiCompareDrawing(
  program: Program,
  sourceComments: DeviceComments,
  targetComments: DeviceComments,
  showComments: boolean,
  zoom: number,
  viewMode: LadderViewMode,
  display: 'both' | 'source' | 'target',
): DirectBlock[] {
  const source = program,
    target = program.comparison!.target;
  const rowHeight =
    showComments && (Object.keys(sourceComments).length || Object.keys(targetComments).length)
      ? 72
      : ROW;
  const commentLists = {
    source: mitsubishiCommentList(source, sourceComments, '比較元 · ' + source.name),
    target: mitsubishiCommentList(target, targetComments, '比較先 · ' + target.name),
  };
  const circuit = (
    network: Program['networks'][number],
    comments: DeviceComments,
    commentList: CommentListData,
  ) => {
    if (display !== 'both') {
      const {
        rowAlignment,
        branchRowAlignment,
        outputRowAlignment,
        comparisonPageRows,
        comparisonNotePadding,
        ...natural
      } = network;
      network = natural;
    }
    const project = (i: Instruction) => projectMitsubishiInstruction(i, comments);
    const grid = displayGrid(network, viewMode),
      instructions = network.instructions.map(project);
    return {
      id: network.id,
      title: network.title || `STEP ${network.step}`,
      height: drawingHeight(network, rowHeight, zoom, viewMode),
      instructions,
      locations: instructions.map((i) => {
        const symbol = grid.symbols.find(
          (s) => s.instruction.id === i.id || s.instruction.pins?.some((p) => p.id === i.id),
        );
        return {
          id: i.id,
          x:
            (symbol
              ? LEFT_GUTTER + (viewMode === 'wrap' ? symbol.col % COLUMNS : symbol.col) * CELL
              : 0) * zoom,
          y: instructionDrawingOffset(network, i.id, rowHeight, zoom, viewMode),
          width: (symbol?.span ?? 1) * CELL * zoom,
        };
      }),
      render: (
        selected: string,
        choose: (i: DirectInstruction) => void,
        _context: unknown,
        navigate: (id: string) => void,
      ) => (
        <CommentListContext.Provider value={commentList}>
          <NetworkDrawing
            network={network}
            zoom={zoom}
            rowHeight={rowHeight}
            viewMode={viewMode}
            selected={selected}
            navigate={navigate}
            choose={(i) => choose(project(i))}
            comments={comments}
            showComments={showComments}
          />
        </CommentListContext.Provider>
      ),
    };
  };
  return pairNetworks(source.networks, target.networks).map((group) => {
    const rows = new Set(
      [...group.source, ...group.target].flatMap((n) => n.instructions.map((i) => i.comparisonRow)),
    );
    return {
      source: group.source.map((n) => circuit(n, sourceComments, commentLists.source)),
      target: group.target.map((n) => circuit(n, targetComments, commentLists.target)),
      changes: program
        .comparison!.changes.filter((c) => rows.has(c.alignmentRow))
        .map((c) => ({
          id: c.alignmentRow,
          kind: c.kind,
          sourceText: c.sourceText,
          targetText: c.targetText,
          sourceLine: 'STEP ' + (c.sourceStep || '—'),
          targetLine: 'STEP ' + (c.targetStep || '—'),
        })),
    };
  });
}
