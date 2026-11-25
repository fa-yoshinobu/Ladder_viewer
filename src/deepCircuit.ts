// Depth selects circuits to check. Only an actual transfer or layout failure triggers recovery.
export const depthProbe = 128;
export function deepCircuitError<T extends object>(
  roots: (T | null | undefined)[],
  children: (node: T) => readonly (T | null)[],
  network: object,
  validateLayout: () => void,
): string | undefined {
  const stack = roots.flatMap((node) => (node ? [{ node, depth: 1 }] : []));
  const visited = new WeakMap<T, number>();
  while (stack.length) {
    const { node, depth } = stack.pop()!;
    if (depth >= depthProbe) {
      try {
        // Include the surrounding message containers; workers clone the whole result.
        structuredClone({ result: { comparison: { groups: [{ source: [network] }] } } });
        validateLayout();
      } catch (error) {
        return `回路を配置できませんでした: ${error instanceof Error ? error.message : String(error)}`;
      }
      return;
    }
    if ((visited.get(node) ?? 0) >= depth) continue;
    visited.set(node, depth);
    for (const child of children(node)) if (child) stack.push({ node: child, depth: depth + 1 });
  }
}
