import {normalizeSearchText as normalize,searchTextMatches} from './searchText';
import type { Instruction, Program } from './model';
import { addressParts } from './address';
import { deviceComment, type DeviceComments } from './comments';

export type SearchMode = 'partial' | 'exact';
export interface SearchEntry {
  instruction: Instruction;
  side: 'source' | 'target';
  fields: string[];
}



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
        instruction.statement,
        instruction.piStatement??'',
        instruction.inlineST?.text??''
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
  const needle=normalize(query);
  return index.filter(entry => searchTextMatches(entry.fields,needle,mode));
}