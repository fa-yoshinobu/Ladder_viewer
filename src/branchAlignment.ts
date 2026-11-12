import { requireValue } from './requireValue';
import { alignSequence } from './compareCore';

export interface BranchRow {
  row: number;
  members: { id: string; comparisonRow?: number; contact: boolean }[];
}
export type BranchRowHints = Record<string, number>;
export const layoutBranches = new WeakMap<object, BranchRow[]>();

// Series symbols share a row; parallel branches and reused outputs have their own rows.
export function alignBranches<T extends object>(render: ((hints: BranchRowHints) => T)[]) {
  const hints: BranchRowHints[] = [{}, {}],
    drawings = render.map((draw, side) => draw(requireValue(hints[side])));
  const groups = drawings.map((d) => layoutBranches.get(d)!);
  const keys = groups.map(
    (side) =>
      new Set(
        side.flatMap((g) =>
          g.members.flatMap((m) => (m.comparisonRow === undefined ? [] : [m.comparisonRow])),
        ),
      ),
  );
  const anchors = groups.map((side, index) =>
    side.map((group, at) => {
      const shared = group.members.filter(
        (m) => m.comparisonRow !== undefined && requireValue(keys[1 - index]).has(m.comparisonRow),
      );
      const contacts = shared.filter((m) => m.contact),
        members = contacts.length ? contacts : shared;
      return {
        at,
        key: members.length
          ? String(Math.min(...members.map((m) => m.comparisonRow!)))
          : `${index}:${at}`,
      };
    }),
  );
  for (const pair of alignSequence(
    requireValue(anchors[0]),
    requireValue(anchors[1]),
    (a) => a.key,
    () => 0,
  )) {
    if (!pair.source || !pair.target) continue;
    const current = [pair.source, pair.target].map(
      (anchor, side) => layoutBranches.get(requireValue(drawings[side]))![anchor.at],
    );
    const row = Math.max(...current.map((g) => requireValue(g).row));
    current.forEach((group, side) => {
      if (requireValue(group).row === row) return;
      for (const member of requireValue(group).members) requireValue(hints[side])[member.id] = row;
      drawings[side] = requireValue(render[side])(requireValue(hints[side]));
    });
  }
  return { drawings, hints };
}
