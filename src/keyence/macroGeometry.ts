import { requireValue } from '../requireValue';
import { CELL } from '../ladderMetrics';
import { commentLines } from '../textLayout';
import type { KeyenceInstruction } from './model';
import { keyenceBoxColumnSpans, keyenceOutputStyle } from './outputStyle';

// Argument names and values stay in one column; comments use the usual two-line limit.
export function keyenceMacroGeometry(instruction: KeyenceInstruction, showComments = true) {
  const spans = keyenceBoxColumnSpans(keyenceOutputStyle(instruction));
  const parameters = instruction.operands.slice(1).map((value, index) => {
    const parameter = instruction.macro?.parameters[index];
    const comment = parameter?.comment ?? '';
    return {
      name: parameter?.name || 'P' + index,
      value,
      operandIndex: index + 1,
      comment,
      commentLines: showComments
        ? commentLines(
            comment,
            Math.max(4, Math.floor((requireValue(spans[index]) * CELL - 12) / 6)),
            2,
          )
        : [],
    };
  });
  const lines = Math.max(0, ...parameters.map((parameter) => parameter.commentLines.length));
  const comment = instruction.macro?.comment ?? '';
  const annotationLines = showComments
    ? commentLines(
        comment,
        Math.max(4, Math.floor((spans.reduce((a, b) => a + b, 0) * CELL - 12) / 6)),
        2,
      )
    : [];
  const totalLines = lines + annotationLines.length;
  return {
    spans,
    parameters,
    comment,
    annotationLines,
    annotationY: 27 + lines * 12,
    top: -32,
    bottom: totalLines ? 16 + totalLines * 12 : 17,
  };
}
