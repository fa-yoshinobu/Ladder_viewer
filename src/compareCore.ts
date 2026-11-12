import { requireValue } from './requireValue';
import { diffArrays } from 'diff';
export type CompareSide = 'source' | 'target';
export type ChangeKind = 'changed' | 'added' | 'removed';
export interface CompareInstruction {
  id: string;
  opcode: string;
  operands: string[];
  annotation: string;
  line: number;
  role: 'condition' | 'action' | 'structure';
  family: string;
  contactKey?: string;
}
export interface Aligned<T> {
  source?: T;
  target?: T;
}
export const commandKey = (i: CompareInstruction) => JSON.stringify([i.opcode, i.operands]);
const alignmentKey = (i: CompareInstruction) => i.contactKey ?? commandKey(i);
function overlap(a: string[], b: string[]): number {
  const counts = new Map<string, number>();
  for (const key of a) counts.set(key, (counts.get(key) ?? 0) + 1);
  let matched = 0;
  for (const key of b) {
    const count = counts.get(key) ?? 0;
    if (count) {
      matched++;
      counts.set(key, count - 1);
    }
  }
  return matched / Math.max(1, a.length, b.length);
}
function changedPairs<T>(a: T[], b: T[], score: (a: T, b: T) => number): Aligned<T>[] {
  if (!a.length) return b.map((target) => ({ target }));
  if (!b.length) return a.map((source) => ({ source }));
  // shortcut: very large fully replaced ranges stay separate; add finer anchors if such ranges need pairing.
  if (a.length * b.length > 250000)
    return [...a.map((source) => ({ source })), ...b.map((target) => ({ target }))];
  const width = b.length + 1,
    values = new Float64Array((a.length + 1) * width),
    moves = new Uint8Array(values.length);
  for (let x = 1; x <= a.length; x++)
    for (let y = 1; y <= b.length; y++) {
      const index = x * width + y,
        left = requireValue(values[index - 1]),
        up = requireValue(values[index - width]),
        similarity = score(requireValue(a[x - 1]), requireValue(b[y - 1]));
      const paired = similarity > 0 ? requireValue(values[index - width - 1]) + similarity : -1;
      if (paired > Math.max(left, up)) {
        values[index] = paired;
        moves[index] = 3;
      } else if (up >= left) {
        values[index] = up;
        moves[index] = 1;
      } else {
        values[index] = left;
        moves[index] = 2;
      }
    }
  const result: Aligned<T>[] = [];
  let x = a.length,
    y = b.length;
  while (x || y) {
    const move = moves[x * width + y];
    if (x && y && move === 3) result.push({ source: a[--x], target: b[--y] });
    else if (x && (!y || move === 1)) result.push({ source: a[--x] });
    else result.push({ target: b[--y] });
  }
  return result.reverse();
}
export function alignSequence<T>(
  a: T[],
  b: T[],
  key: (value: T) => string,
  score: (a: T, b: T) => number,
): Aligned<T>[] {
  const result: Aligned<T>[] = [];
  let x = 0,
    y = 0;
  const chunks = diffArrays(a.map(key), b.map(key));
  for (let index = 0; index < chunks.length; index++) {
    const chunk = requireValue(chunks[index]);
    if (!chunk.added && !chunk.removed) {
      for (let n = 0; n < chunk.count; n++) result.push({ source: a[x++], target: b[y++] });
      continue;
    }
    const removed: T[] = [],
      added: T[] = [];
    while (
      index < chunks.length &&
      (requireValue(chunks[index]).added || requireValue(chunks[index]).removed)
    ) {
      const part = requireValue(chunks[index]);
      for (let n = 0; n < part.count; n++)
        if (part.removed) removed.push(requireValue(a[x++]));
        else added.push(requireValue(b[y++]));
      index++;
    }
    index--;
    result.push(...changedPairs(removed, added, score));
  }
  return result;
}
// Unchanged circuits anchor repeated prefixes; edited spans may split or join circuits.
export function alignInstructions(
  source: CompareInstruction[][],
  target: CompareInstruction[][],
): Aligned<CompareInstruction>[] {
  const networkKey = (network: CompareInstruction[]) => JSON.stringify(network.map(commandKey));
  const result: Aligned<CompareInstruction>[] = [];
  let x = 0,
    y = 0;
  const chunks = diffArrays(source.map(networkKey), target.map(networkKey));
  for (let index = 0; index < chunks.length; index++) {
    const chunk = requireValue(chunks[index]);
    if (!chunk.added && !chunk.removed) {
      for (let n = 0; n < chunk.count; n++) {
        const a = requireValue(source[x++]),
          b = requireValue(target[y++]);
        result.push(...a.map((instruction, index) => ({ source: instruction, target: b[index] })));
      }
      continue;
    }
    const a: CompareInstruction[] = [],
      b: CompareInstruction[] = [];
    while (
      index < chunks.length &&
      (requireValue(chunks[index]).added || requireValue(chunks[index]).removed)
    ) {
      const part = requireValue(chunks[index]);
      for (let n = 0; n < part.count; n++)
        if (part.removed) a.push(...requireValue(source[x++]));
        else b.push(...requireValue(target[y++]));
      index++;
    }
    index--;
    const sourceKeys = new Set(a.map(alignmentKey)),
      targetKeys = new Set(b.map(alignmentKey));
    const score = (left: CompareInstruction, right: CompareInstruction) => {
      // The same contact/device can change LD/AND/OR role when adjacent conditions disappear.
      const leftKey = alignmentKey(left),
        rightKey = alignmentKey(right);
      if (leftKey === rightKey)
        return left.role === 'structure' ? 0.25 : left.role === 'action' ? 12 : 5;
      // Do not substitute a command that still exists on the opposite side.
      if (targetKeys.has(leftKey) || sourceKeys.has(rightKey) || left.role !== right.role) return 0;
      if (left.role === 'structure' && left.family !== right.family) return 0;
      if (left.opcode === right.opcode) return 1 + overlap(left.operands, right.operands);
      return JSON.stringify(left.operands) === JSON.stringify(right.operands) &&
        (left.operands.length || left.role === 'structure')
        ? 0.5
        : 0;
    };
    // shortcut: bound weighted alignment memory; large spans use exact command anchors first.
    result.push(
      ...(a.length * b.length > 250000
        ? alignSequence(a, b, alignmentKey, score)
        : changedPairs(a, b, score)),
    );
  }
  return result;
}
export function pairAlignedNetworks<T extends { instructions: { comparisonRow?: number }[] }>(
  source: T[],
  target: T[],
): { source: T[]; target: T[] }[] {
  const entries = [
    ...source.map((network) => ({ network, side: 'source' as const })),
    ...target.map((network) => ({ network, side: 'target' as const })),
  ]
    .map((item) => ({
      ...item,
      start: Math.min(...item.network.instructions.map((i) => i.comparisonRow!)),
      end: Math.max(...item.network.instructions.map((i) => i.comparisonRow!)),
    }))
    .sort((a, b) => a.start - b.start);
  const groups: { source: T[]; target: T[] }[] = [];
  let end = -1;
  for (const item of entries) {
    if (item.start > end) {
      groups.push({ source: [], target: [] });
      end = item.end;
    } else end = Math.max(end, item.end);
    groups.at(-1)![item.side].push(item.network);
  }
  return groups;
}
export function adjacentDifferenceBlock(
  blocks: { top: number; changes: unknown[] }[],
  scrollTop: number,
  direction: 1 | -1,
  anchor = -1,
): number {
  const differences = blocks.flatMap((block, index) => (block.changes.length ? [index] : []));
  if (!differences.length) return -1;
  if (direction > 0) {
    let current = anchor;
    blocks.forEach((block, index) => {
      if (block.top <= scrollTop + 1) current = Math.max(current, index);
    });
    return differences.find((index) => index > current) ?? -1;
  }
  return (
    differences
      .filter((index) =>
        anchor >= 0 ? index < anchor : requireValue(blocks[index]).top < scrollTop - 1,
      )
      .at(-1) ?? -1
  );
}
