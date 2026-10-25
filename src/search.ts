import type { Instruction, Program } from './model';
import { addressParts } from './address';
import { deviceComment, type DeviceComments } from './comments';

export type SearchMode = 'partial' | 'exact';
export interface SearchEntry {
  instruction: Instruction;
  side: 'source' | 'target';
  fields: string[];
}

const normalize = (text: string) => text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

export function buildSearchIndex(
  program: Program,
  comments: DeviceComments,
  display: 'both' | 'source' | 'target'
): SearchEntry[] {
  const index: SearchEntry[] = [];
  const add = (current: Program, side: SearchEntry['side']) => {
    for (const instruction of current.instructions) {
      const step = normalize(instruction.step);
      const fields = [
        instruction.op,
        ...instruction.operands,
        [instruction.op, ...instruction.operands].join(' '),
        ...(step ? [step, 'STEP ' + step] : []),
        instruction.note,
        instruction.statement
      ];
      for (const address of [instruction.op, ...instruction.operands]) {
        const parts = addressParts(address);
        if (parts.some(part => part.index)) fields.push(parts.filter(part => !part.index).map(part => part.text).join(''));
        fields.push(deviceComment(address, comments));
      }
      index.push({ instruction, side, fields: fields.map(normalize).filter(Boolean) });
    }
  };
  if (!program.comparison) add(program, 'source');
  else {
    if (display !== 'target') add(program, 'source');
    if (display !== 'source') add(program.comparison.target, 'target');
  }
  return index;
}

export function searchInstructions(index: SearchEntry[], query: string, mode: SearchMode): SearchEntry[] {
  const normalized = normalize(query);
  if (!normalized) return [];
  if (mode === 'exact') return index.filter(entry => entry.fields.includes(normalized));
  const terms = normalized.split(' ');
  return index.filter(entry => terms.every(term => entry.fields.some(field => field.includes(term))));
}