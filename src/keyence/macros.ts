import { requireValue } from '../requireValue';
import type { KeyenceProgram } from './model';
import { keyenceDeviceComment } from './comments';

// MNM separates operand comments with at least two spaces; ambiguous prose stays intact.
function operandComments(comment: string, count: number): string[] | undefined {
  if (!comment) return undefined;
  const parts = comment.trim().split(/\t+| {2,}/);
  return parts.length === count ? parts : undefined;
}
function parameterNames(program: KeyenceProgram): Map<number, string> {
  const candidates = new Map<number, Set<string>>();
  for (const instruction of program.instructions) {
    const comments = operandComments(instruction.comment, instruction.operands.length);
    for (const [index, operand] of instruction.operands.entries()) {
      const match = /^P(\d+)$/i.exec(operand);
      if (!match) continue;
      const name = comments?.[index] || keyenceDeviceComment(operand, program.deviceComments);
      if (!name) continue;
      const number = Number(match[1]),
        names = candidates.get(number) ?? new Set<string>();
      names.add(name);
      candidates.set(number, names);
    }
  }
  return new Map(
    [...candidates]
      .filter(([, names]) => names.size === 1)
      .map(([number, names]) => [number, requireValue([...names][0])]),
  );
}

// Callers pass one folder at a time so unrelated projects cannot supply macro labels.
export function linkKeyenceMacros(programs: KeyenceProgram[]): void {
  const definitions = new Map<string, Map<number, string> | null>();
  for (const program of programs) {
    if (program.moduleType !== '1' || !program.moduleName.trim()) continue;
    const name = program.moduleName.trim().toUpperCase();
    definitions.set(name, definitions.has(name) ? null : parameterNames(program));
  }
  for (const program of programs)
    for (const instruction of program.instructions) {
      if (!/^@?MCALL$/i.test(instruction.opcode) || instruction.operands.length < 2) continue;
      const args = instruction.operands.slice(1),
        comments = operandComments(instruction.comment, args.length);
      const names = definitions.get(requireValue(instruction.operands[0]).toUpperCase());
      instruction.macro = {
        parameters: args.map((operand, index) => ({
          name: names?.get(index) ?? 'P' + index,
          comment: comments?.[index] ?? keyenceDeviceComment(operand, program.deviceComments),
        })),
        ...(!comments && instruction.comment ? { comment: instruction.comment } : {}),
      };
    }
}
