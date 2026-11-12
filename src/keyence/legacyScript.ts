import type { KeyenceProgram } from './model';

export interface KeyenceLegacyScriptRegion {
  id: string;
  guardStartIndex: number;
  jumpIndex: number;
  endIndex: number;
  sourceLines: { sourceLine: number; raw: string; text: string }[];
  leadingStatement: string;
}

const loadGuard = /^LD(?:B|P|F|PB|FB|[<>=]+(?:\.[A-Z]+)?)?$/i;
const extendGuard =
  /^(?:AND|ANB|ANP|ANF|ANPB|ANFB|OR|ORB|ORP|ORF|ORPB|ORFB|(?:AND|OR)[<>=]+(?:\.[A-Z]+)?)$/i;
const jumpOpcodes = new Set(['CJ', 'NCJ', 'SCJ', 'GOTO', 'JMP', 'CALL', 'SCALL']);
const regionBoundary =
  /^(?:END|ENDH|STP|STE|SBN|RET|INT|RETI|MC|MCR|AREA_ST|BOX_ST|DISABLED_RUNG|END_DISABLED_RUNG|BOOKMARK|RUNG_COMMENT)$/i;
const metadata = /^;?(?:DEVICE|MODULE|MODULE_TYPE|SCRIPT_TYPE):/i;
const compilerWarning = /^;Warning\[\d+\]:/i;
const executableSource = /^\s*(?:[@A-Z_][\w.@:\[\]]*\s*=(?!=)|[A-Z_]\w*(?:\.[A-Z]+)?\s*\()/i;

// Legacy exports repeat the complete script before a guarded NCJ/LABEL region.
// Keep the original instructions intact; unproven regions remain ordinary ladder.
export function findKeyenceLegacyScriptRegions(
  program: KeyenceProgram,
): KeyenceLegacyScriptRegion[] {
  if (!program.metadata.some((entry) => entry.key === 'SCRIPT_TYPE')) return [];
  const instructions = program.instructions,
    lines = program.text.split(/\r\n?|\n/),
    regions: KeyenceLegacyScriptRegion[] = [];
  const labels = new Map<string, number[]>();
  for (const [index, instruction] of instructions.entries())
    if (instruction.opcode.toUpperCase() === 'LABEL' && instruction.operands.length === 1) {
      const key = instruction.operands[0].toUpperCase();
      labels.set(key, [...(labels.get(key) ?? []), index]);
    }
  const comment = (index: number) => {
    const raw = lines[index] ?? '',
      semicolon = raw.indexOf(';');
    return semicolon >= 0 && !raw.slice(0, semicolon).trim() && !metadata.test(raw.trim())
      ? { sourceLine: index + 1, raw, text: raw.slice(semicolon + 1) }
      : undefined;
  };
  for (let jumpIndex = 1; jumpIndex < instructions.length; jumpIndex++) {
    const jump = instructions[jumpIndex];
    if (
      jump.opcode.toUpperCase() !== 'NCJ' ||
      jump.operands.length !== 1 ||
      !/^#\d+$/.test(jump.operands[0])
    )
      continue;
    const destinations = labels.get(jump.operands[0].toUpperCase());
    if (destinations?.length !== 1 || destinations[0] <= jumpIndex + 1) continue;
    const endIndex = destinations[0];
    let guardStartIndex = jumpIndex - 1;
    while (
      guardStartIndex > 0 &&
      extendGuard.test(instructions[guardStartIndex].opcode) &&
      !instructions[guardStartIndex].statement.trim()
    )
      guardStartIndex--;
    const guard = instructions[guardStartIndex];
    if (
      !loadGuard.test(guard.opcode) ||
      instructions.slice(guardStartIndex + 1, jumpIndex + 1).some((i) => i.statement.trim())
    )
      continue;
    const header: KeyenceLegacyScriptRegion['sourceLines'] = [];
    for (let index = guard.sourceLine - 2; index >= 0; index--) {
      const line = comment(index);
      if (!line) break;
      header.unshift(line);
    }
    const nonblankHeader = header.filter((line) => line.text.trim());
    const repeated: string[] = [];
    for (let index = jump.sourceLine; index < instructions[endIndex].sourceLine - 1; index++) {
      const line = comment(index);
      if (line?.text.trim() && !compilerWarning.test(line.text.trim()))
        repeated.push(line.text.trim());
    }
    if (!repeated.length || repeated.length > nonblankHeader.length) continue;
    const sourceHeader = nonblankHeader.slice(-repeated.length);
    if (
      sourceHeader.some((line, index) => line.text.trim() !== repeated[index]) ||
      !sourceHeader.some((line) => executableSource.test(line.text))
    )
      continue;
    const body = instructions.slice(jumpIndex + 1, endIndex);
    if (body.some((i) => regionBoundary.test(i.opcode) || !!i.disabled !== !!guard.disabled))
      continue;
    const regionLabels = new Set(
      instructions
        .slice(jumpIndex + 1, endIndex + 1)
        .filter((i) => i.opcode.toUpperCase() === 'LABEL')
        .map((i) => i.operands[0]?.toUpperCase()),
    );
    if ([...regionLabels].some((label) => !label || labels.get(label)?.length !== 1)) continue;
    const crossingJump = instructions.some((instruction, index) => {
      if (!jumpOpcodes.has(instruction.opcode.toUpperCase())) return false;
      const target = instruction.operands[0]?.toUpperCase(),
        inside = index >= jumpIndex && index <= endIndex;
      return inside
        ? instruction.operands.length !== 1 || !regionLabels.has(target)
        : regionLabels.has(target);
    });
    if (crossingJump) continue;
    const start = header.indexOf(sourceHeader[0]);
    regions.push({
      id: `legacy-script-${jump.id}`,
      guardStartIndex,
      jumpIndex,
      endIndex,
      sourceLines: header.slice(start),
      leadingStatement: header
        .slice(0, start)
        .map((line) => line.text.replace(/<h[1-6]\s*\/>/gi, '').trim())
        .join('\n')
        .trim(),
    });
    jumpIndex = endIndex;
  }
  return regions;
}
