import { requireValue } from './requireValue';
import type { Instruction, Network } from './model';

export interface MasterControlRange {
  start: Instruction;
  end?: Instruction;
  level: number;
  lane: number;
}

export function assignMasterControlRanges(networks: Network[]): void {
  let active: MasterControlRange[] = [];
  const starts = new Map<MasterControlRange, Network>();
  for (const network of networks) {
    const touched = new Set(active);
    for (const instruction of network.instructions) {
      if (instruction.op !== 'MC' && instruction.op !== 'MCR') continue;
      const token = instruction.operands[0] ?? '';
      const level = /^N\d+$/i.test(token) ? Number(token.slice(1)) : NaN;
      const label = `${instruction.op} ${token || '(N未指定)'}（STEP ${instruction.step || '?'}）`;
      if (!Number.isSafeInteger(level) || level < 0 || level > 14) {
        network.warnings.push(`${label}: N0～N14の番号ではないためMC範囲を判定しません。`);
        continue;
      }
      if (instruction.op === 'MC') {
        if (active.length && level <= requireValue(active[active.length - 1]).level) {
          network.warnings.push(
            `${label}: 同時に有効なMCのN番号より大きくないため、未対応のネスト順として範囲を作成しません。`,
          );
          continue;
        }
        const range: MasterControlRange = { start: instruction, level, lane: active.length };
        active.push(range);
        touched.add(range);
        starts.set(range, network);
      } else {
        const closing = active.filter((range) => range.level >= level);
        if (!closing.length) network.warnings.push(`${label}: 解除対象のMC範囲がありません。`);
        for (const range of closing) {
          range.end = instruction;
          touched.add(range);
        }
        active = active.filter((range) => range.level < level);
      }
    }
    if (touched.size) network.masterControlRanges = [...touched];
  }
  for (const range of active)
    starts
      .get(range)!
      .warnings.push(
        `MC N${range.level}（STEP ${range.start.step || '?'}）に対応するMCRがありません。`,
      );
}
