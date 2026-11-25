import { blockRangeText } from '../blockRangeCopy';
import { LADDER_WIDTH, SCROLLBAR_HEIGHT } from '../ladderMetrics';
import { requireValue } from '../requireValue';
import { keyenceCommentList, type CommentListData } from '../commentListData';
import {
  normalizeSearchText as normalize,
  searchTextMatches,
  type SearchTextMode,
} from '../searchText';
import { keyenceInstructionCopyText } from './instructionCopy';
import { keyenceDeviceComment } from './comments';
import { keyenceScriptNetworks, keyenceScriptRegions } from './scriptDisplay';
import {
  layoutKeyenceNetwork,
  keyenceViewDrawing,
  keyenceInstructionComment,
  singleRowSize,
  type KeyencePaintDrawing,
} from './layout';
import type { KeyenceInstruction, KeyenceProgram, KeyenceScriptDisplay } from './model';

// The parser owns the text and circuit graph. Only navigation, requested search
// results and visible drawings cross the worker boundary.
export interface KeyenceViewerProgram extends Pick<
  KeyenceProgram,
  'name' | 'moduleName' | 'deviceCode' | 'deviceComments'
> {
  port: MessagePort;
  instructionCount: number;
  first: KeyenceInstruction;
  hasComments: boolean;
  hasStructuredText: boolean;
}
export interface KeyenceRow {
  id: string;
  title: string;
  actions: string;
  range: string;
  first: string;
  instructionIds: string[];
  firstLine: number;
  script?: KeyenceScriptDisplay;
  width: number;
  height: number;
  horizontal: boolean;
}
export interface ConfigureLayout {
  action: 'configure';
  revision: number;
  expanded: string[];
  showComments: boolean;
  mode: 'wrap' | 'scroll';
  top: number;
  viewportHeight: number;
  zoom: number;
}
type LayoutRequest =
  | ConfigureLayout
  | { action: 'range'; revision: number; indexes: number[] }
  | { action: 'search'; query: string; mode: SearchTextMode; reply: MessagePort }
  | { action: 'comments'; reply: MessagePort }
  | { action: 'close' };
export type LayoutReply = {
  revision: number;
  rows?: KeyenceRow[];
  drawings?: [number, KeyencePaintDrawing][];
  error?: string;
};

export function requestKeyenceInfo(
  program: KeyenceViewerProgram,
  request: { action: 'comments' },
): Promise<CommentListData>;
export function requestKeyenceInfo(
  program: KeyenceViewerProgram,
  request: { action: 'search'; query: string; mode: SearchTextMode },
): Promise<KeyenceInstruction[]>;
export function requestKeyenceInfo(
  program: KeyenceViewerProgram,
  request: { action: 'comments' } | { action: 'search'; query: string; mode: SearchTextMode },
) {
  const { port1, port2 } = new MessageChannel();
  return new Promise<CommentListData | KeyenceInstruction[]>((resolve, reject) => {
    port1.onmessage = ({ data }) => {
      port1.close();
      if (data.error) reject(new Error(data.error));
      else resolve(data.result);
    };
    program.port.postMessage({ ...request, reply: port2 }, [port2]);
  });
}

function searchFields(item: KeyenceInstruction, program: KeyenceProgram) {
  return [
    item.opcode,
    ...item.operands,
    [item.opcode, ...item.operands].join(' '),
    keyenceInstructionCopyText(item, program),
    String(item.sourceLine),
    `元ファイル ${item.sourceLine}行`,
    `行 ${item.sourceLine}`,
    item.comment,
    item.statement,
    keyenceInstructionComment(item, program),
    ...item.operands.map((address) => keyenceDeviceComment(address, program.deviceComments)),
    ...(item.macro?.parameters.flatMap((parameter) => [parameter.name, parameter.comment]) ?? []),
    ...(item.st?.lines.flatMap((line) => [
      line.text,
      String(line.sourceLine),
      `元ファイル ${line.sourceLine}行`,
      `行 ${line.sourceLine}`,
    ]) ?? []),
  ]
    .map(normalize)
    .filter(Boolean);
}

export function serveKeyenceProgram(program: KeyenceProgram): KeyenceViewerProgram {
  const { port1, port2 } = new MessageChannel();
  let searchIndex: string[][] | undefined;
  const comments = keyenceCommentList(program);
  let revision = 0;
  let drawingAt: (index: number) => KeyencePaintDrawing = () => {
    throw new Error('回路の配置が完了していません。');
  };
  const reply = (message: LayoutReply) => port1.postMessage(message);
  port1.onmessage = ({ data }: MessageEvent<LayoutRequest>) => {
    if (data.action === 'close') {
      port1.close();
      return;
    }
    if (data.action === 'search' || data.action === 'comments') {
      try {
        if (data.action === 'comments') data.reply.postMessage({ result: comments });
        else {
          searchIndex ??= program.instructions.map((item) => searchFields(item, program));
          const needle = normalize(data.query);
          data.reply.postMessage({
            result: program.instructions.filter((_, i) =>
              searchTextMatches(requireValue(searchIndex![i]), needle, data.mode),
            ),
          });
        }
      } catch (error) {
        data.reply.postMessage({ error: error instanceof Error ? error.message : String(error) });
      } finally {
        data.reply.close();
      }
      return;
    }
    try {
      if (data.action === 'range') {
        if (data.revision === revision)
          reply({
            revision,
            drawings: data.indexes.map((index) => [index, drawingAt(index)]),
          });
        return;
      }
      revision = data.revision;
      const rows: KeyenceRow[] = [];
      const visible: [number, KeyencePaintDrawing][] = [];
      let top = 8;
      const networks = keyenceScriptNetworks(program, new Set(data.expanded));
      drawingAt = (index) => {
        let network = requireValue(networks[index]);
        let drawing;
        try {
          drawing = keyenceViewDrawing(
            layoutKeyenceNetwork(network, program, data.showComments),
            data.mode,
          );
        } catch (error) {
          // Keep the original lines and existing warning presentation if this circuit cannot be laid out.
          network = {
            ...network,
            actions: [],
            condition: null,
            statement: network.instructions.map((i) => i.raw).join('\n'),
            warnings: [
              ...network.warnings,
              `回路を配置できませんでした: ${error instanceof Error ? error.message : String(error)}`,
            ],
          };
          networks[index] = network;
          drawing = layoutKeyenceNetwork(network, program, data.showComments);
        }
        const { instructions, warnings, disabled, script, scriptRange } = network;
        return { ...drawing, network: { instructions, warnings, disabled, script, scriptRange } };
      };
      networks.forEach((network, index) => {
        const { instructions, script } = network;
        const simple = singleRowSize(network, program, data.showComments);
        const paint = simple ? undefined : drawingAt(index);
        const drawing = simple ?? requireValue(paint);
        const first = requireValue(instructions[0]);
        const horizontal = data.mode === 'scroll' && drawing.width > LADDER_WIDTH;
        rows.push({
          id: network.id,
          title: network.statement.split('\n')[0] || `元ファイル ${first.sourceLine}行`,
          actions: network.actions
            .map(({ instruction }) => [instruction.opcode, ...instruction.operands].join(' '))
            .join(' / '),
          range: blockRangeText([network]),
          first: first.id,
          instructionIds: instructions.flatMap((i) =>
            i.script && !i.script.expanded ? i.script.instructionIds : [i.id],
          ),
          firstLine: first.sourceLine,
          script,
          width: drawing.width,
          height: drawing.height,
          horizontal,
        });
        const bottom =
          top + Math.ceil(drawing.height * data.zoom) + (horizontal ? SCROLLBAR_HEIGHT : 0);
        if (
          bottom > Math.max(0, data.top - data.viewportHeight) &&
          top < data.top + 2 * data.viewportHeight
        )
          visible.push([index, paint ?? drawingAt(index)]);
        top = bottom;
      });
      reply({ revision, rows, drawings: visible });
    } catch (error) {
      reply({
        revision: data.revision,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
  const { name, moduleName, deviceCode, deviceComments, instructions } = program;
  return {
    name,
    moduleName,
    deviceCode,
    deviceComments,
    instructionCount: instructions.length,
    first: requireValue(instructions[0]),
    port: port2,
    hasComments: Object.keys(deviceComments).length > 0 || instructions.some((i) => !!i.comment),
    hasStructuredText: instructions.some((i) => i.st) || keyenceScriptRegions(program).length > 0,
  };
}
