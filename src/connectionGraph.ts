import { requireValue } from './requireValue';
export interface ConnectionWire {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export interface ConnectionTerminal {
  x: number;
  y: number;
  key: string;
  instruction: string;
  input: boolean;
}
export interface ConnectionInput {
  wires: ConnectionWire[];
  terminals: ConnectionTerminal[];
  railX: number;
}
const onWire = (p: { x: number; y: number }, w: ConnectionWire) =>
  w.x1 === w.x2
    ? p.x === w.x1 && p.y >= Math.min(w.y1, w.y2) && p.y <= Math.max(w.y1, w.y2)
    : p.y === w.y1 && p.x >= Math.min(w.x1, w.x2) && p.x <= Math.max(w.x1, w.x2);
function graph(input: ConnectionInput) {
  const points: { x: number; y: number }[] = [],
    indices = new Map<string, number>();
  const point = (x: number, y: number) => {
    const key = x + ':' + y;
    let index = indices.get(key);
    if (index === undefined) {
      index = points.length;
      points.push({ x, y });
      indices.set(key, index);
    }
    return index;
  };
  const terminals = input.terminals.map((t) => ({ ...t, point: point(t.x, t.y) }));
  for (const w of input.wires) {
    point(w.x1, w.y1);
    point(w.x2, w.y2);
  }
  for (const h of input.wires.filter((w) => w.y1 === w.y2))
    for (const v of input.wires.filter((w) => w.x1 === w.x2)) {
      const p = { x: v.x1, y: h.y1 };
      if (onWire(p, h) && onWire(p, v)) point(p.x, p.y);
    }
  const parents = points.map((_, index) => index);
  const find = (index: number): number =>
    parents[index] === index ? index : (parents[index] = find(requireValue(parents[index])));
  const union = (a: number, b: number) => {
    parents[find(a)] = find(b);
  };
  for (const w of input.wires) {
    const first = point(w.x1, w.y1);
    points.forEach((p, index) => {
      if (onWire(p, w)) union(first, index);
    });
  }
  const rail = points.flatMap((p, index) => (p.x === input.railX ? [index] : []));
  for (const index of rail.slice(1)) union(requireValue(rail[0]), index);
  const railRoot = rail.length ? find(requireValue(rail[0])) : -1,
    members = new Map<number, Set<string>>();
  for (const t of terminals) {
    const root = find(t.point);
    if (!members.has(root)) members.set(root, new Set());
    members.get(root)!.add(t.key);
  }
  const signatures = new Map(
    [...members].map(([root, keys]) => [
      root,
      root === railRoot ? 'rail' : JSON.stringify([...keys].sort()),
    ]),
  );
  return {
    input,
    points,
    terminals,
    find,
    railRoot,
    railKeys: members.get(railRoot) ?? new Set<string>(),
    signatures,
  };
}
export function compareConnectionGraphs(source: ConnectionInput[], target: ConnectionInput[]) {
  const sides = [source.map(graph), target.map(graph)];
  return sides.map((nets, side) => {
    const other = requireValue(sides[1 - side]),
      signatures = new Set(other.flatMap((n) => [...n.signatures.values()])),
      railKeys = new Set(other.flatMap((n) => [...n.railKeys]));
    return nets.map((net) => {
      const changed = (root: number) =>
        root !== net.railRoot &&
        net.signatures.has(root) &&
        !signatures.has(net.signatures.get(root)!);
      const inputs: string[] = [],
        outputs: string[] = [];
      for (const t of net.terminals) {
        const root = net.find(t.point);
        if (changed(root) || (root === net.railRoot && !railKeys.has(t.key)))
          (t.input ? inputs : outputs).push(t.instruction);
      }
      const wires = net.input.wires.flatMap((w, index) => {
        const root = net.find(net.points.findIndex((p) => p.x === w.x1 && p.y === w.y1));
        return changed(root) ||
          (root === net.railRoot &&
            w.y1 === w.y2 &&
            net.terminals.some(
              (t) => onWire(requireValue(net.points[t.point]), w) && !railKeys.has(t.key),
            ))
          ? [index]
          : [];
      });
      return {
        kind: side === 0 ? ('removed' as const) : ('added' as const),
        wires,
        inputs,
        outputs,
      };
    });
  });
}
