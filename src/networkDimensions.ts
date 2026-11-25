import type { Network } from './model';
import {
  LADDER_WIDTH,
  SCROLLBAR_HEIGHT,
  gridLayout,
  isCoil,
  networkSize,
  type LadderViewMode,
} from './layout';

export const titleHeight = (n: Network) => (n.title ? n.title.split('\n').length * 18 : 0);
export const horizontalScrollbarHeight = (n: Network, mode: LadderViewMode) =>
  mode === 'scroll' && gridLayout(n).pages > 1 ? SCROLLBAR_HEIGHT : 0;

// A plain contact driving a single coil occupies exactly one row and one page in either mode.
function isSingleContactCoil(n: Network) {
  const [contact, coil] = n.instructions;
  const action = n.actions[0];
  return (
    n.instructions.length === 2 &&
    n.actions.length === 1 &&
    contact?.op === 'LD' &&
    contact.operands.length === 1 &&
    !!coil &&
    isCoil(coil) &&
    action?.instruction === coil &&
    action.condition?.kind === 'contact' &&
    action.condition.instruction === contact &&
    !contact.note &&
    !coil.note &&
    !coil.pins &&
    !coil.inlineST &&
    !n.pointer &&
    !n.functionBlock &&
    !n.masterControl &&
    !n.rowAlignment &&
    !n.branchRowAlignment &&
    !n.outputRowAlignment &&
    !n.comparisonPageRows &&
    !n.comparisonNotePadding &&
    !n.connectionDifferences
  );
}

export function describeNetworkSize(n: Network, rowHeight: number, mode: LadderViewMode) {
  const title = titleHeight(n),
    warnings = n.warnings.length * 25;
  if (isSingleContactCoil(n))
    return { width: LADDER_WIDTH, height: rowHeight, title, warnings, scrollbar: 0 };
  const natural = networkSize(n, rowHeight);
  const scrollbar = horizontalScrollbarHeight(n, mode);
  return {
    width: natural.width,
    height: scrollbar ? networkSize(n, rowHeight, mode).height : natural.height,
    title,
    warnings,
    scrollbar,
  };
}
