import { requireValue } from '../requireValue';
import type { KeyenceInstruction, KeyenceProgram } from './model';
import { buildKeyenceNetworks, type KeyenceNetwork } from './logic';
import { findKeyenceLegacyScriptRegions, type KeyenceLegacyScriptRegion } from './legacyScript';
import { keyenceInstructionComment } from './layout';
import type { KeyenceComparison } from './comparison';

const regionsCache = new WeakMap<KeyenceProgram, KeyenceLegacyScriptRegion[]>();
export function keyenceScriptRegions(program: KeyenceProgram): KeyenceLegacyScriptRegion[] {
  let regions = regionsCache.get(program);
  if (!regions) {
    regions = findKeyenceLegacyScriptRegions(program);
    regionsCache.set(program, regions);
  }
  return regions;
}
const sourceText = (region: KeyenceLegacyScriptRegion) =>
  region.sourceLines.map((line) => line.text).join('\n');
function counterpart(
  program: KeyenceProgram,
  region: KeyenceLegacyScriptRegion,
  other?: KeyenceProgram,
) {
  if (!other) return undefined;
  const row = requireValue(program.instructions[region.jumpIndex]).comparisonRow;
  if (row === undefined) return undefined;
  return keyenceScriptRegions(other).find(
    (r) => requireValue(other.instructions[r.jumpIndex]).comparisonRow === row,
  );
}

// Only the drawing is projected: the parsed instructions and comparison remain complete.
export function keyenceScriptNetworks(
  program: KeyenceProgram,
  expanded: ReadonlySet<string> = new Set(),
  other?: KeyenceProgram,
  keys: ReadonlyMap<string, string> = new Map(),
): KeyenceNetwork[] {
  const regions = keyenceScriptRegions(program);
  if (!regions.length) return buildKeyenceNetworks(program);
  const instructions: KeyenceInstruction[] = [];
  let cursor = 0;
  for (const region of regions) {
    instructions.push(...program.instructions.slice(cursor, region.guardStartIndex));
    const own = program.instructions.slice(region.guardStartIndex, region.endIndex + 1),
      guard = { ...requireValue(own[0]), statement: region.leadingStatement };
    const peer = counterpart(program, region, other),
      peerGuard = peer && other?.instructions[peer.guardStartIndex];
    if (
      guard.difference?.kind === 'changed' &&
      peerGuard &&
      other &&
      JSON.stringify([
        guard.opcode,
        guard.operands,
        guard.statement,
        keyenceInstructionComment(guard, program),
      ]) ===
        JSON.stringify([
          peerGuard.opcode,
          peerGuard.operands,
          peer!.leadingStatement,
          keyenceInstructionComment(peerGuard, other),
        ])
    )
      guard.difference = undefined;
    const body = program.instructions.slice(region.jumpIndex, region.endIndex + 1),
      id = keys.get(region.id) ?? region.id,
      isExpanded = expanded.has(id);
    const script = { id, expanded: isExpanded, instructionIds: body.map((i) => i.id) };
    const jump = requireValue(program.instructions[region.jumpIndex]);
    if (isExpanded) {
      instructions.push(
        guard,
        ...program.instructions.slice(region.guardStartIndex + 1, region.jumpIndex),
        { ...jump, script },
        ...body.slice(1),
      );
    } else {
      const sourceChanged = peer ? sourceText(region) !== sourceText(peer) : false,
        bodyChanged = body.some((i) => i.difference);
      const box: KeyenceInstruction = {
        ...jump,
        opcode: 'BOX_ST',
        operands: [],
        comment: '',
        statement: '',
        sourceEndLine: requireValue(program.instructions[region.endIndex]).sourceLine,
        st: { lines: region.sourceLines, legacyScript: true },
        script: { ...script, hiddenDifference: bodyChanged && !sourceChanged },
      };
      if (bodyChanged || sourceChanged) {
        const kind = body.every((i) => i.difference?.kind === 'added')
          ? 'added'
          : body.every((i) => i.difference?.kind === 'removed')
            ? 'removed'
            : 'changed';
        box.difference = {
          kind,
          opChanged: false,
          operandChanges: [],
          otherText: peer ? sourceText(peer) : '',
        };
      } else box.difference = undefined;
      instructions.push(
        guard,
        ...program.instructions.slice(region.guardStartIndex + 1, region.jumpIndex),
        box,
      );
    }
    cursor = region.endIndex + 1;
  }
  instructions.push(...program.instructions.slice(cursor));
  const networks = buildKeyenceNetworks({ ...program, instructions }).map((network) => {
    const script = network.instructions.find((i) => i.script)?.script;
    return script ? { ...network, script } : network;
  });
  const networkByInstruction = new Map(
    networks.flatMap((network, index) => network.instructions.map((i) => [i.id, index] as const)),
  );
  for (const region of regions) {
    const id = keys.get(region.id) ?? region.id;
    if (!expanded.has(id)) continue;
    const start = networkByInstruction.get(
        requireValue(program.instructions[region.guardStartIndex]).id,
      ),
      end = networkByInstruction.get(requireValue(program.instructions[region.endIndex]).id);
    if (start === undefined || end === undefined) continue;
    for (let index = start; index <= end; index++)
      requireValue(networks[index]).scriptRange = {
        id,
        start: index === start,
        end: index === end,
      };
  }
  return networks;
}

export function keyenceVisibleInstructions(
  network: KeyenceNetwork,
  program: KeyenceProgram,
): KeyenceInstruction[] {
  if (!network.instructions.some((i) => i.script && !i.script.expanded))
    return network.instructions;
  const originals = new Map(program.instructions.map((i) => [i.id, i]));
  return network.instructions.flatMap((i) =>
    i.script && !i.script.expanded
      ? [
          i,
          ...i.script.instructionIds
            .filter((id) => id !== i.id)
            .map((id) => originals.get(id)!)
            .filter(Boolean),
        ]
      : [i],
  );
}

// Merge original comparison groups only across a proven script boundary, then fold both sides together.
export function keyenceScriptComparison(
  comparison: KeyenceComparison,
  expanded: ReadonlySet<string>,
): KeyenceComparison {
  const sides = ['source', 'target'] as const;
  const regions = sides.map((side) => keyenceScriptRegions(comparison[side]));
  if (!regions.some((r) => r.length)) return comparison;
  const groupById = sides.map(
    (side) =>
      new Map(
        comparison.groups.flatMap((g, index) =>
          g[side].flatMap((n) => n.instructions.map((i) => [i.id, index] as const)),
        ),
      ),
  );
  const intervals = regions
    .flatMap((rs, side) =>
      rs.map((region) => {
        const start = requireValue(groupById[side]).get(
          requireValue(comparison[requireValue(sides[side])].instructions[region.guardStartIndex])
            .id,
        );
        const end = requireValue(groupById[side]).get(
          requireValue(comparison[requireValue(sides[side])].instructions[region.endIndex]).id,
        );
        return { start: start ?? -1, end: end ?? -1 };
      }),
    )
    .filter((r) => r.start >= 0 && r.end >= r.start);
  const ranges: { start: number; end: number }[] = [];
  for (let start = 0; start < comparison.groups.length;) {
    let end = start;
    for (let previous = -1; previous !== end;) {
      previous = end;
      for (const range of intervals)
        if (range.start <= end && range.end >= start) end = Math.max(end, range.end);
    }
    ranges.push({ start, end });
    start = end + 1;
  }
  const keys = regions.map(
    (rs, side) =>
      new Map(
        rs.map((region) => {
          const program = comparison[requireValue(sides[side])],
            peer = counterpart(program, region, comparison[requireValue(sides[1 - side])]);
          const key = peer
            ? 'script-pair-' + requireValue(program.instructions[region.jumpIndex]).comparisonRow
            : `script-${sides[side]}-${region.id}`;
          return [region.id, key] as const;
        }),
      ),
  );
  const networks = sides.map((side, index) =>
    keyenceScriptNetworks(
      comparison[side],
      expanded,
      comparison[requireValue(sides[1 - index])],
      keys[index],
    ),
  );
  const displayGroup = new Map(
    ranges.flatMap(({ start, end }, index) =>
      Array.from({ length: end - start + 1 }, (_, offset) => [start + offset, index] as const),
    ),
  );
  const groups = ranges.map(({ start, end }) => ({
    source: [] as KeyenceNetwork[],
    target: [] as KeyenceNetwork[],
    changes: comparison.groups.slice(start, end + 1).flatMap((g) => g.changes),
  }));
  networks.forEach((side, index) =>
    side.forEach((network) => {
      const original = requireValue(groupById[index]).get(
        requireValue(network.instructions[0]).id,
      )!;
      requireValue(groups[displayGroup.get(original)!])[requireValue(sides[index])].push(network);
    }),
  );
  return { ...comparison, groups };
}
