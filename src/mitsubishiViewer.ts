import type { Instruction, Network, Program } from './model';
import { describeNetworkSize } from './networkDimensions';
import { COMMENT_ROW, ROW, gridLayout, type GridLayout, type LadderViewMode } from './layout';

export interface ViewerArea {
  height: number;
  zoom: number;
  comments: boolean;
  mode: LadderViewMode;
}
interface Row extends Pick<
  Network,
  'id' | 'title' | 'step' | 'warnings' | 'instructions' | 'pointer'
> {
  actions: { instruction: Instruction }[];
}
export type MitsubishiPaint = { network: Network; grid: GridLayout };
export interface RemoteMitsubishi extends Omit<Program, 'networks' | 'comparison'> {
  comparison?: undefined;
  networks: Row[];
  sizes: Float64Array;
  initial: MitsubishiPaint[];
  port: MessagePort;
}
export type MitsubishiDocument = RemoteMitsubishi | Program;
export function isRemoteMitsubishi(program: MitsubishiDocument): program is RemoteMitsubishi {
  return 'port' in program;
}
// One row per circuit. Width, title, warnings and scrollbar are invariant under row height.
const columns = 8;
export function storedNetworkSize(
  doc: RemoteMitsubishi,
  index: number,
  rowHeight: number,
  mode: LadderViewMode,
) {
  const table = doc.sizes,
    offset = index * columns;
  const heightColumn = 4 + (rowHeight === COMMENT_ROW ? 2 : 0) + (mode === 'scroll' ? 1 : 0);
  return {
    width: table[offset]!,
    title: table[offset + 1]!,
    warnings: table[offset + 2]!,
    scrollbar: mode === 'scroll' ? table[offset + 3]! : 0,
    height: table[offset + heightColumn]!,
  };
}

export function serveMitsubishiProgram(
  program: Program,
  hasComments: boolean,
  area?: ViewerArea,
): RemoteMitsubishi {
  const { port1, port2 } = new MessageChannel();
  const sizes = new Float64Array(program.networks.length * columns);
  const initial: MitsubishiPaint[] = [];
  const paint = (index: number): MitsubishiPaint => {
    const original = program.networks[index]!;
    // SVG and navigation use instruction identity and the finished grid; branch
    // expressions and compiler-only FB structures may be much deeper than the IPC stack.
    const { evaluation, functionBlock, actions, ...drawing } = original;
    const grid = gridLayout(original);
    return {
      network: {
        ...drawing,
        actions: actions.map(({ instruction }) => ({ instruction, condition: null })),
      },
      grid,
    };
  };
  let top = 8;
  const rows = program.networks.map((n, index) => {
    const measure = (network: Network) => {
      const wrap = describeNetworkSize(network, ROW, 'wrap');
      const scroll = describeNetworkSize(network, ROW, 'scroll');
      const commentsWrap = hasComments ? describeNetworkSize(network, COMMENT_ROW, 'wrap') : wrap;
      const commentsScroll = hasComments
        ? describeNetworkSize(network, COMMENT_ROW, 'scroll')
        : scroll;
      sizes.set(
        [
          wrap.width,
          wrap.title,
          wrap.warnings,
          scroll.scrollbar,
          wrap.height,
          scroll.height,
          commentsWrap.height,
          commentsScroll.height,
        ],
        index * columns,
      );
      return area?.comments
        ? area.mode === 'scroll'
          ? commentsScroll
          : commentsWrap
        : area?.mode === 'scroll'
          ? scroll
          : wrap;
    };
    let size;
    try {
      size = measure(n);
    } catch (error) {
      n = {
        id: n.id,
        title: n.title,
        step: n.step,
        instructions: n.instructions,
        actions: [],
        warnings: [
          ...n.warnings,
          '回路を配置できませんでした: ' + (error instanceof Error ? error.message : String(error)),
        ],
      };
      program.networks[index] = n;
      size = measure(n);
    }
    if (area && top < area.height + 400) {
      initial.push(paint(index));
      top += (size.height + size.title) * area.zoom + size.warnings + size.scrollbar;
    }
    const { id, title, step, warnings, instructions, pointer } = n;
    const first = n.actions[0]?.instruction;
    return {
      id,
      title,
      step,
      warnings,
      instructions,
      pointer,
      actions: first ? [{ instruction: first }] : [],
    };
  });
  port1.onmessage = ({
    data,
  }: MessageEvent<
    { action: 'close' } | { action: 'range'; indices: number[]; request: number }
  >) => {
    if (data.action === 'close') {
      port1.close();
      return;
    }
    try {
      port1.postMessage({ request: data.request, drawings: data.indices.map(paint) });
    } catch (error) {
      port1.postMessage({
        request: data.request,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
  return {
    name: program.name,
    cpu: program.cpu,
    instructions: program.instructions,
    relativePath: program.relativePath,
    warnings: program.warnings,
    networks: rows,
    sizes,
    initial,
    port: port2,
  };
}
