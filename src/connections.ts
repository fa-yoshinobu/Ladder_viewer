import { isControlMarker } from './controlFlow';
import type { Network } from './model';
import { gridLayout } from './layout';
import {
  compareConnectionGraphs,
  type ConnectionInput,
  type ConnectionTerminal,
} from './connectionGraph';
export function compareConnections(source: Network[], target: Network[]): void {
  const describe = (network: Network): ConnectionInput => {
    const grid = gridLayout(network),
      terminals: ConnectionTerminal[] = [];
    for (const symbol of grid.symbols) {
      if (isControlMarker(symbol.instruction.op)) continue;
      const id = symbol.instruction.comparisonRow ?? symbol.instruction.id;
      terminals.push({
        x: symbol.col,
        y: symbol.row,
        key: `${id}:in`,
        instruction: symbol.instruction.id,
        input: true,
      });
      if (symbol.contact)
        terminals.push({
          x: symbol.col + symbol.span,
          y: symbol.row,
          key: `${id}:out`,
          instruction: symbol.instruction.id,
          input: false,
        });
    }
    return { wires: grid.wires, terminals, railX: 0 };
  };
  const differences = compareConnectionGraphs(source.map(describe), target.map(describe));
  // Branch alignment can merge different wire spans; single-side display uses the original spans.
  const describeNatural = (n: Network) =>
    describe({
      ...n,
      rowAlignment: undefined,
      branchRowAlignment: undefined,
      outputRowAlignment: undefined,
      connectionDifferences: undefined,
    });
  const natural =
    source.some((n) => n.outputRowAlignment || n.branchRowAlignment) ||
    target.some((n) => n.outputRowAlignment || n.branchRowAlignment)
      ? compareConnectionGraphs(source.map(describeNatural), target.map(describeNatural))
      : undefined;
  for (const [side, networks] of [source, target].entries())
    networks.forEach((network, index) => {
      const difference = differences[side][index];
      network.connectionDifferences =
        network.outputRowAlignment || network.branchRowAlignment
          ? { ...difference, naturalWires: natural![side][index].wires }
          : difference;
    });
}
