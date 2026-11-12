import { diffArrays } from 'diff';
import { LADDER_WIDTH, LEFT_GUTTER } from '../ladderMetrics';
import type { KeyenceInstruction } from './model';

export const ST_ROW_HEIGHT = 20,
  ST_HEADER_HEIGHT = 34;
export interface KeyenceStRow {
  sourceLine: number;
  text: string;
  continuation: boolean;
}
const characterWidth = (char: string) => (/[^\x00-\xff\uFF61-\uFF9F]/.test(char) ? 2 : 1);
export function keyenceStLayout(
  instruction: KeyenceInstruction,
  wrap: boolean,
  width = LADDER_WIDTH,
) {
  const rows: KeyenceStRow[] = [],
    limit = Math.max(1, Math.floor((width - LEFT_GUTTER - 24) / 7));
  let widest = 0;
  for (const line of instruction.st?.lines ?? []) {
    let expanded = '',
      column = 0;
    for (const char of line.text) {
      const width = char === '\t' ? 4 - (column % 4) : characterWidth(char);
      expanded += char === '\t' ? ' '.repeat(width) : char;
      column += width;
    }
    widest = Math.max(widest, column);
    let text = '',
      width = 0,
      continuation = false;
    for (const char of expanded) {
      const size = characterWidth(char);
      if (wrap && width + size > limit && text) {
        rows.push({ sourceLine: line.sourceLine, text, continuation });
        text = '';
        width = 0;
        continuation = true;
      }
      text += char;
      width += size;
    }
    rows.push({ sourceLine: line.sourceLine, text, continuation });
  }
  return {
    rows,
    width: wrap ? width : Math.max(width, LEFT_GUTTER + widest * 7 + 24),
    height: ST_HEADER_HEIGHT + Math.max(1, rows.length) * ST_ROW_HEIGHT + 10,
  };
}

export function keyenceStChangedLines(instruction: KeyenceInstruction): Set<number> {
  const lines = instruction.st?.lines ?? [],
    difference = instruction.difference;
  if (!difference) return new Set();
  if (difference.kind !== 'changed') return new Set(lines.map((line) => line.sourceLine));
  const changed = new Set<number>();
  let index = 0;
  for (const part of diffArrays(
    lines.map((line) => line.text),
    difference.otherText.split('\n'),
  )) {
    if (part.added) continue;
    if (part.removed) for (let n = 0; n < part.count; n++) changed.add(lines[index + n].sourceLine);
    index += part.count;
  }
  return changed;
}
