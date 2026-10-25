import type { Instruction } from './model';
import { isPointerDefinition } from './instructions';
import { deviceComment, type DeviceComments } from './comments';

export function instructionCopyText(instruction: Instruction, comments: DeviceComments): string {
  const lines = [[instruction.op, ...instruction.operands].join(' ')];
  const addresses = isPointerDefinition(instruction.op) ? [instruction.op, ...instruction.operands] : instruction.operands;
  for (const address of addresses) {
    const comment = deviceComment(address, comments);
    if (comment) lines.push(`${address}: ${comment}`);
  }
  if (instruction.note) lines.push(instruction.note);
  for (const pin of instruction.pins ?? []) lines.push(instructionCopyText(pin, comments));
  return lines.join('\n').replace(/\r\n?|\n/g, '\r\n');
}