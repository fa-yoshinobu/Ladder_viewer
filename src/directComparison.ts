import { requireValue } from './requireValue';
import type { BatchResult } from './batch';
import type { Program } from './model';
import { deviceComment, type DeviceComments } from './comments';
import type { KeyenceProgram } from './keyence/model';
import { compareMitsubishiPrograms } from './directMitsubishi';
import { compareKeyencePrograms, type KeyenceComparison } from './keyence/comparison';
import { buildKeyenceNetworks } from './keyence/logic';
import { keyenceInstructionComment } from './keyence/layout';
export type DirectInput =
  | {
      format: 'mitsubishi';
      name: string;
      relativePath?: string;
      program: Program;
      comments: DeviceComments;
    }
  | { format: 'keyence'; name: string; relativePath?: string; program: KeyenceProgram };
export interface DirectPair {
  id: string;
  label: string;
  error?: string;
  source?: DirectInput;
  target?: DirectInput;
}
export type DirectResult =
  | {
      format: 'mitsubishi';
      program: Program;
      sourceComments: DeviceComments;
      targetComments: DeviceComments;
    }
  | { format: 'keyence'; comparison: KeyenceComparison };
export function directInputs(batch: BatchResult): DirectInput[] {
  return [
    ...batch.programs.map((program) => ({
      format: 'mitsubishi' as const,
      name: program.name,
      relativePath: program.relativePath,
      program,
      comments: batch.commentsByProgram[program.name] ?? {},
    })),
    ...batch.keyencePrograms.map((program) => ({
      format: 'keyence' as const,
      name: program.name,
      relativePath: program.relativePath,
      program,
    })),
  ];
}
const key = (input: DirectInput) =>
  input.format +
  ':' +
  (input.relativePath ?? input.name).replaceAll('\\', '/').normalize('NFKC').toLowerCase();
export function pairDirectPrograms(source: DirectInput[], target: DirectInput[]): DirectPair[] {
  if (
    source.length === 1 &&
    target.length === 1 &&
    ((!requireValue(source[0]).relativePath && !requireValue(target[0]).relativePath) ||
      key(requireValue(source[0])) === key(requireValue(target[0])))
  )
    return [
      {
        id: 'pair',
        label:
          requireValue(source[0]).name === requireValue(target[0]).name
            ? requireValue(source[0]).name
            : requireValue(source[0]).name + ' → ' + requireValue(target[0]).name,
        source: source[0],
        target: target[0],
      },
    ];
  const remaining = new Set(target),
    pairs: DirectPair[] = [];
  for (const input of source) {
    let match = [...remaining].find((other) => key(input) === key(other));
    if (!match) {
      const leaf = (i: DirectInput) => key(i).split('/').at(-1);
      const matches = [...remaining].filter(
        (other) =>
          other.format === input.format &&
          (!input.relativePath || !other.relativePath) &&
          leaf(input) === leaf(other),
      );
      if (
        matches.length === 1 &&
        source.filter((other) => other.format === input.format && leaf(other) === leaf(input))
          .length === 1
      )
        match = matches[0];
    }
    if (match) remaining.delete(match);
    pairs.push({ id: 'source:' + key(input), label: input.name, source: input, target: match });
  }
  for (const input of remaining)
    pairs.push({ id: 'target:' + key(input), label: input.name, target: input });
  return pairs.sort((a, b) => a.label.localeCompare(b.label, 'ja', { numeric: true }));
}
export function compareDirectPair(pair: DirectPair): DirectResult {
  if (pair.error) throw new Error(pair.error);
  const input = pair.source ?? pair.target;
  if (!input) throw new Error('比較するプログラムがありません。');
  if (pair.source && pair.target && pair.source.format !== pair.target.format)
    throw new Error('比較元と比較先には同じメーカーのファイルを指定してください。');
  if (input.format === 'mitsubishi') {
    const empty: Program = {
      name: '（なし）',
      cpu: input.program.cpu,
      instructions: [],
      networks: [],
      warnings: [],
    };
    const source = pair.source?.format === 'mitsubishi' ? pair.source : undefined,
      target = pair.target?.format === 'mitsubishi' ? pair.target : undefined;
    return {
      format: 'mitsubishi',
      program: compareMitsubishiPrograms(
        source?.program ?? empty,
        target?.program ?? empty,
        source?.comments,
        target?.comments,
      ),
      sourceComments: source?.comments ?? {},
      targetComments: target?.comments ?? {},
    };
  }
  const empty: KeyenceProgram = {
    ...input.program,
    name: '（なし）',
    instructions: [],
    text: '',
    comments: [],
    deviceComments: {},
    metadata: [],
  };
  return {
    format: 'keyence',
    comparison: compareKeyencePrograms(
      pair.source?.format === 'keyence' ? pair.source.program : empty,
      pair.target?.format === 'keyence' ? pair.target.program : empty,
    ),
  };
}

export function unchangedDirectPair(pair: DirectPair): boolean {
  const source = pair.source,
    target = pair.target;
  if (pair.error) return false;
  if (!source || !target || source.format !== target.format) return false;
  const fingerprint = (input: DirectInput) => {
    if (input.format === 'mitsubishi') {
      if (input.program.comparison) return null;
      return JSON.stringify(
        input.program.networks.map((n) =>
          n.instructions.map((i) => [
            i.op,
            i.operands,
            i.statement,
            i.piStatement ?? '',
            i.note,
            i.inlineST?.text ?? '',
            i.operands.map((v) => deviceComment(v, input.comments)),
          ]),
        ),
      );
    }
    return JSON.stringify(
      buildKeyenceNetworks(input.program).map((n) =>
        n.instructions.map((i) => [
          i.opcode,
          i.operands,
          i.statement,
          keyenceInstructionComment(i, input.program),
          i.macro,
        ]),
      ),
    );
  };
  const left = fingerprint(source),
    right = fingerprint(target);
  return left !== null && right !== null && left === right;
}
