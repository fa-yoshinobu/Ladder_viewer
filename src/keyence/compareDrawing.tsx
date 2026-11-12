import type { DirectBlock, DirectInstruction } from '../directDrawing';
import { HorizontalScroll } from '../HorizontalScroll';
import { LADDER_WIDTH, SCROLLBAR_HEIGHT } from '../ladderMetrics';
import { KeyenceLadder } from './Ladder';
import { keyenceComparisonDrawings, type KeyenceComparison } from './comparison';
import { keyenceInstructionComment, keyenceSymbolOwns, type KeyenceDrawing } from './layout';
import { keyenceInstructionCopyText } from './instructionCopy';
import type { KeyenceInstruction, KeyenceProgram } from './model';
import { keyenceScriptComparison, keyenceVisibleInstructions } from './scriptDisplay';
export const projectKeyenceInstruction = (
  i: KeyenceInstruction,
  program: KeyenceProgram,
): DirectInstruction => ({
  id: i.id,
  op: i.st ? (i.opcode.toUpperCase() === 'BOX_ST' ? 'BOX_ST' : 'ST') : i.opcode,
  operands: i.operands,
  line: `元ファイル ${i.sourceLine}行`,
  sourceLine: i.sourceLine,
  sourceEndLine: i.sourceEndLine,
  row: i.comparisonRow,
  statement: i.statement,
  comment: [
    keyenceInstructionComment(i, program),
    ...(i.fb?.pins.map((p) => p.name) ?? []),
    ...(i.macro?.parameters.flatMap((p) => [p.name, p.comment]) ?? []),
  ]
    .filter(Boolean)
    .join('\n'),
  copyText: keyenceInstructionCopyText(i, program),
  difference: i.difference,
});
export function keyenceCompareDrawing(
  comparison: KeyenceComparison,
  showComments: boolean,
  zoom: number,
  viewMode: 'wrap' | 'scroll',
  display: 'both' | 'source' | 'target',
  expandedScripts: ReadonlySet<string> = new Set(),
  onToggleScript?: (id: string) => void,
): DirectBlock[] {
  const circuit = (drawing: KeyenceDrawing, program: KeyenceProgram) => {
    const project = (i: KeyenceInstruction) => projectKeyenceInstruction(i, program);
    const scrolling = viewMode === 'scroll' && drawing.width > LADDER_WIDTH,
      height = Math.ceil(drawing.height * zoom) + (scrolling ? SCROLLBAR_HEIGHT : 0);
    const visible = keyenceVisibleInstructions(drawing.network, program),
      instructions = visible.map(project);
    return {
      id: drawing.network.id,
      title:
        drawing.network.statement || `元ファイル ${drawing.network.instructions[0].sourceLine}行`,
      height,
      instructions,
      script: drawing.network.script,
      locations: instructions.map((i, index) => {
        const original = visible[index];
        const symbol =
          drawing.symbols.find((s) => keyenceSymbolOwns(s, i.id)) ??
          [...drawing.symbols].sort(
            (a, b) =>
              Math.abs(a.instruction.sourceLine - original.sourceLine) -
              Math.abs(b.instruction.sourceLine - original.sourceLine),
          )[0];
        return {
          id: i.id,
          x: (symbol?.x ?? 0) * zoom,
          y: Math.max(0, (symbol?.y ?? drawing.headerHeight) * zoom - 28 * zoom),
          width: (symbol?.width ?? 74) * zoom,
        };
      }),
      render: (
        selected: string,
        choose: (i: DirectInstruction) => void,
        context: (event: MouseEvent, i: DirectInstruction) => void,
      ) => (
        <HorizontalScroll
          enabled={scrolling}
          width={LADDER_WIDTH * zoom}
          contentWidth={drawing.width * zoom}
          height={height}
          label={`回路 元ファイル ${drawing.network.instructions[0].sourceLine}行 横スクロール`}
        >
          <KeyenceLadder
            drawing={drawing}
            zoom={zoom}
            selected={selected}
            onSelect={(i) => choose(project(i))}
            onContextMenu={(event, i) => context(event, project(i))}
            onToggleScript={onToggleScript}
          />
        </HorizontalScroll>
      ),
    };
  };
  return keyenceComparisonDrawings(
    keyenceScriptComparison(comparison, expandedScripts),
    showComments,
    viewMode,
    display === 'both',
  ).map((group) => ({
    source: group.source.map((d) => circuit(d, comparison.source)),
    target: group.target.map((d) => circuit(d, comparison.target)),
    changes: group.changes.map((c) => ({
      id: c.row,
      kind: c.kind,
      sourceText: c.source ? [c.source.opcode, ...c.source.operands].join(' ') : '',
      targetText: c.target ? [c.target.opcode, ...c.target.operands].join(' ') : '',
      sourceLine: c.source ? `元ファイル ${c.source.sourceLine}行` : '—',
      targetLine: c.target ? `元ファイル ${c.target.sourceLine}行` : '—',
    })),
  }));
}
