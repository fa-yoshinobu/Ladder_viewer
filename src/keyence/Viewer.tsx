import { DetailPanel } from '../DetailPanel';
import { blockRangeMenu, blockRangeText } from '../blockRangeCopy';
import { openCommentList, showInstructionMenu, closeInstructionMenu } from '../CommentList';
import { keyenceCommentList, commentListRequest } from '../commentListData';
import { normalizeSearchText as normalize, searchTextMatches } from '../searchText';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { KeyenceInstruction, KeyenceProgram } from './model';
import { nativeCsvBridge } from '../nativeCsv';
import {
  keyenceScriptNetworks,
  keyenceScriptRegions,
  keyenceVisibleInstructions,
} from './scriptDisplay';
import {
  keyenceInstructionComment,
  layoutKeyenceNetwork,
  keyenceViewDrawing,
  keyenceSymbolOwns,
} from './layout';
import { LADDER_WIDTH, SCROLLBAR_HEIGHT } from '../ladderMetrics';
import { HorizontalScroll } from '../HorizontalScroll';
import { KeyenceLadder } from './Ladder';
import { SearchBar } from '../SearchBar';
import { ViewerHeader } from '../ViewerHeader';
import { keyenceInstructionCopyText } from './instructionCopy';
import { keyenceDeviceComment } from './comments';
import { ST_HEADER_HEIGHT, ST_ROW_HEIGHT } from './structuredText';
import { StColorToggle } from '../StColorToggle';
import { ViewerToolbar } from '../ViewerToolbar';
import { useZoom } from '../useZoom';
import { fitZoom } from '../zoom';

interface Props {
  program: KeyenceProgram;
  names: string[];
  busy: boolean;
  progress: string;
  error: string;
  dark: boolean;
  palette: string;
  changePalette: (value: string) => void;
  onCompare?: () => void;
  choose: (name: string) => void;
  openFiles: () => void;
  openFolder: () => void;
  toggleTheme: () => void;
  drop: (files: File[]) => void;
}
const noExpandedScripts = new Set<string>();
export function KeyenceViewer({
  program,
  names,
  busy,
  progress,
  error,
  dark,
  palette,
  changePalette,
  choose,
  openFiles,
  openFolder,
  toggleTheme,
  drop,
  onCompare,
}: Props) {
  const viewport = useRef<HTMLDivElement>(null),
    viewAnchor = useRef<number | null>(null);
  const [showComments, setShowComments] = useState(true);
  const { zoom, setZoom, zoomIn, zoomOut } = useZoom();
  const [size, setSize] = useState({ width: 1000, height: 800 }),
    [scrollTop, setScrollTop] = useState(0);
  const [selected, setSelected] = useState(''),
    [selectedNetwork, setSelectedNetwork] = useState('');
  const [query, setQuery] = useState(''),
    [searchIndex, setSearchIndex] = useState(-1);
  const [viewMode, setViewMode] = useState<'wrap' | 'scroll'>('wrap');
  const [searchMode, setSearchMode] = useState<'partial' | 'exact'>('partial');
  const [pendingTarget, setPendingTarget] = useState<KeyenceInstruction | null>(null);
  const [scriptExpansion, setScriptExpansion] = useState(() => ({
      program,
      ids: new Set<string>(),
    })),
    [scriptTarget, setScriptTarget] = useState<KeyenceInstruction | null>(null);
  const expandedScripts =
    scriptExpansion.program === program ? scriptExpansion.ids : noExpandedScripts;
  const setExpandedScripts = (update: (old: Set<string>) => Set<string>) =>
    setScriptExpansion((old) => ({
      program,
      ids: update(old.program === program ? old.ids : noExpandedScripts),
    }));
  const [copyError, setCopyError] = useState('');
  const commentList = useMemo(() => keyenceCommentList(program), [program]);
  const networks = useMemo(
    () => keyenceScriptNetworks(program, expandedScripts),
    [program, expandedScripts],
  );
  const hasComments = useMemo(
    () =>
      Object.keys(program.deviceComments).length > 0 ||
      program.instructions.some((instruction) => !!instruction.comment),
    [program],
  );
  const baseDrawings = useMemo(
    () => networks.map((network) => layoutKeyenceNetwork(network, program, showComments)),
    [networks, program, showComments],
  );
  const drawings = useMemo(
    () => baseDrawings.map((drawing) => keyenceViewDrawing(drawing, viewMode)),
    [baseDrawings, viewMode],
  );
  const scrolling = useMemo(
    () => drawings.map((drawing) => viewMode === 'scroll' && drawing.width > LADDER_WIDTH),
    [drawings, viewMode],
  );
  const dimensions = useMemo(() => {
    let total = 8;
    const offsets: number[] = [],
      heights: number[] = [];
    for (const [index, drawing] of drawings.entries()) {
      offsets.push(total);
      const height = Math.ceil(drawing.height * zoom) + (scrolling[index] ? SCROLLBAR_HEIGHT : 0);
      heights.push(height);
      total += height;
    }
    return { offsets, heights, total: total + 8 };
  }, [drawings, zoom, scrolling]);
  const visible = useMemo(() => {
    // Binary search keeps navigation near the end from leaving blank areas.
    const { offsets, heights } = dimensions;
    let low = 0,
      high = offsets.length;
    const start = Math.max(0, scrollTop - size.height),
      end = scrollTop + size.height * 2;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (offsets[mid] + heights[mid] < start) low = mid + 1;
      else high = mid;
    }
    const indices: number[] = [];
    for (let index = low; index < offsets.length && offsets[index] < end; index++)
      indices.push(index);
    return indices;
  }, [dimensions, scrollTop, size.height]);
  const instruction = useMemo(
    () =>
      networks.flatMap((n) => n.instructions).find((item) => item.id === selected) ??
      program.instructions.find((item) => item.id === selected),
    [program, networks, selected],
  );
  const instructionNetworks = useMemo(
    () =>
      new Map(
        networks.flatMap((network, index) =>
          keyenceVisibleInstructions(network, program).map((item) => [item.id, index] as const),
        ),
      ),
    [networks, program],
  );
  const searchEntries = useMemo(() => {
    return program.instructions.map((item) => ({
      item,
      fields: [
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
        ...(item.macro?.parameters.flatMap((parameter) => [parameter.name, parameter.comment]) ??
          []),
        ...(item.st?.lines.flatMap((line) => [
          line.text,
          String(line.sourceLine),
          `元ファイル ${line.sourceLine}行`,
          `行 ${line.sourceLine}`,
        ]) ?? []),
      ]
        .map(normalize)
        .filter(Boolean),
    }));
  }, [program]);
  const matches = useMemo(() => {
    const needle = normalize(query);
    return searchEntries
      .filter((entry) => searchTextMatches(entry.fields, needle, searchMode))
      .map((entry) => entry.item);
  }, [searchEntries, query, searchMode]);
  const searchResults = useMemo(
    () =>
      matches.map((item) => ({
        heading: `元ファイル ${item.sourceLine}行 · ${[item.opcode, ...item.operands].join(' ')}`,
      })),
    [matches],
  );
  const fit = () => {
    const width = viewport.current?.clientWidth ?? size.width;
    setZoom(fitZoom(width));
  };
  useEffect(() => {
    setScriptTarget(null);
    setSelected(program.instructions[0]?.id ?? '');
    setSelectedNetwork(networks[0]?.id ?? '');
    setScrollTop(0);
    closeInstructionMenu();
    setPendingTarget(null);
    if (viewport.current) viewport.current.scrollTop = 0;
  }, [program]);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    let lastWidth = 0;
    const observer = new ResizeObserver(() => {
      setSize({ width: element.clientWidth, height: element.clientHeight });
      if (element.offsetWidth !== lastWidth) {
        setZoom(fitZoom(element.clientWidth));
        lastWidth = element.offsetWidth;
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [program]);
  useEffect(() => {
    if (!pendingTarget || !viewport.current) return;
    const element = viewport.current;
    const index = instructionNetworks.get(pendingTarget.id);
    if (index === undefined) {
      setPendingTarget(null);
      return;
    }
    const symbol = drawings[index].symbols.find((symbol) =>
      keyenceSymbolOwns(symbol, pendingTarget.id),
    );
    const networkElement = element.querySelector<HTMLElement>(
      '[data-network="' + networks[index].id + '"]',
    );
    if (!symbol) {
      setPendingTarget(null);
      return;
    }
    if (!networkElement) return;
    const section = networkElement.querySelector<HTMLElement>('.network-scroll'),
      scroller = section ?? element;
    const origin = section
      ? 0
      : networkElement.getBoundingClientRect().left -
        element.getBoundingClientRect().left +
        element.scrollLeft;
    const left = origin + symbol.x * zoom,
      right = origin + (symbol.x + symbol.width) * zoom;
    if (left < scroller.scrollLeft || right > scroller.scrollLeft + scroller.clientWidth)
      scroller.scrollLeft = Math.max(0, left - 24);
    setPendingTarget(null);
  }, [pendingTarget, visible, drawings, zoom]);
  const moveTo = (index: number, item?: KeyenceInstruction) => {
    const script = networks[index].script;
    if (item && script && !script.expanded && script.instructionIds.includes(item.id)) {
      setExpandedScripts((old) => new Set([...old, script.id]));
      setScriptTarget(item);
      return;
    }
    setSelectedNetwork(networks[index].id);
    if (item) {
      setSelected(item.id);
      setPendingTarget(item);
    }
    const element = viewport.current;
    if (element) {
      const symbol =
        item && drawings[index].symbols.find((symbol) => keyenceSymbolOwns(symbol, item.id));
      const stLine =
        drawings[index].st && item?.st && normalize(query)
          ? item.st.lines.find((line) =>
              searchTextMatches(
                [
                  line.text,
                  String(line.sourceLine),
                  `元ファイル ${line.sourceLine}行`,
                  `行 ${line.sourceLine}`,
                ].map(normalize),
                normalize(query),
                searchMode,
              ),
            )
          : undefined;
      const stRow = stLine
        ? (drawings[index].stRows?.findIndex((row) => row.sourceLine === stLine.sourceLine) ?? 0)
        : 0;
      const target =
        dimensions.offsets[index] +
        (stLine
          ? Math.max(0, (ST_HEADER_HEIGHT + Math.max(0, stRow) * ST_ROW_HEIGHT) * zoom - 60)
          : symbol
            ? Math.max(0, symbol.y * zoom - 60)
            : 0);
      element.scrollTop = Math.max(
        0,
        Math.min(target, element.scrollHeight - element.clientHeight),
      );
      setScrollTop(element.scrollTop);
    }
  };
  useLayoutEffect(() => {
    if (!scriptTarget) return;
    const index = instructionNetworks.get(scriptTarget.id);
    if (index !== undefined) {
      setScriptTarget(null);
      moveTo(index, scriptTarget);
    }
  }, [scriptTarget, networks]);
  const toggleScript = (id: string) => {
    const index = networks.findIndex((n) => n.script?.id === id),
      top = index >= 0 ? dimensions.offsets[index] : 0;
    const instructionId = networks[index]?.instructions[0]?.id;
    setExpandedScripts((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (instructionId) {
      setSelected(instructionId);
      setSelectedNetwork(instructionId);
    }
    if (viewport.current) {
      viewport.current.scrollTop = Math.min(viewport.current.scrollTop, top);
      setScrollTop(viewport.current.scrollTop);
    }
  };
  const select = (item: KeyenceInstruction) => {
    setSelected(item.id);
    const index = instructionNetworks.get(item.id);
    if (index !== undefined) setSelectedNetwork(networks[index].id);
  };
  const searchMove = (direction: number) => {
    if (!matches.length) return;
    const index =
      searchIndex < 0
        ? direction < 0
          ? matches.length - 1
          : 0
        : (searchIndex + direction + matches.length) % matches.length;
    setSearchIndex(index);
    const item = matches[index],
      networkIndex = instructionNetworks.get(item.id);
    if (networkIndex !== undefined) moveTo(networkIndex, item);
  };
  useEffect(() => {
    setSearchIndex(matches.length ? 0 : -1);
    const item = matches[0],
      index = item && instructionNetworks.get(item.id);
    if (item && index !== undefined) moveTo(index, item);
  }, [matches]);
  useLayoutEffect(() => {
    const index = viewAnchor.current,
      element = viewport.current;
    if (index === null || !element) return;
    viewAnchor.current = null;
    element.scrollTop = dimensions.offsets[index] ?? 0;
    setScrollTop(element.scrollTop);
  }, [viewMode, dimensions]);
  const changeViewMode = (next: 'wrap' | 'scroll') => {
    if (next === viewMode) return;
    const selectedIndex = networks.findIndex((network) => network.id === selectedNetwork);
    const selectedVisible =
      selectedIndex >= 0 &&
      dimensions.offsets[selectedIndex] < scrollTop + size.height &&
      dimensions.offsets[selectedIndex] + dimensions.heights[selectedIndex] > scrollTop;
    viewAnchor.current = selectedVisible
      ? selectedIndex
      : Math.max(
          0,
          dimensions.offsets.findIndex(
            (offset, index) => offset + dimensions.heights[index] > scrollTop,
          ),
        );
    setViewMode(next);
  };
  const copyText = (item: KeyenceInstruction) => keyenceInstructionCopyText(item, program);
  const contextMenu = (event: MouseEvent, item: KeyenceInstruction) => {
    event.preventDefault();
    event.stopPropagation();
    select(item);
    setCopyError('');
    showInstructionMenu(
      event,
      copyText(item),
      commentListRequest(commentList, item.operands, dark),
      () => setCopyError('コピーできませんでした。'),
    );
  };
  return (
    <div
      class="app keyence-app"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        if (event.dataTransfer?.files.length) drop(Array.from(event.dataTransfer.files));
      }}
    >
      <ViewerHeader
        onComments={() =>
          openCommentList(commentListRequest(commentList, instruction?.operands, dark)!)
        }
        onCompare={onCompare}
        programNames={names}
        currentName={program.name}
        description={program.deviceCode === '60' ? 'KEYENCE KV-X' : 'KEYENCE'}
        busy={busy}
        dark={dark}
        onChoose={choose}
        onToggleTheme={toggleTheme}
        onAbout={() => nativeCsvBridge()?.postMessage({ type: 'show-about', dark })}
        onOpenFiles={openFiles}
        onOpenFolder={openFolder}
      />
      <div class="subbar">
        <SearchBar
          query={query}
          mode={searchMode}
          results={searchResults}
          current={searchIndex}
          onQuery={setQuery}
          onMode={setSearchMode}
          onMove={searchMove}
          onClear={() => setQuery('')}
          placeholder="デバイス・命令・コメント・元ファイル行"
        />
        <div>
          <ViewerToolbar
            hasComments={hasComments}
            comments={showComments}
            onComments={setShowComments}
            dark={dark}
            palette={palette}
            onPalette={changePalette}
            viewMode={viewMode}
            onViewMode={changeViewMode}
            zoom={zoom}
            onFit={fit}
            onZoomOut={zoomOut}
            onZoomIn={zoomIn}
            onResetZoom={() => setZoom(1)}
          >
            {(program.instructions.some((i) => i.st) ||
              keyenceScriptRegions(program).length > 0) && <StColorToggle />}
          </ViewerToolbar>
        </div>
      </div>
      {(error || copyError) && (
        <div class="error" role="alert">
          {error || copyError}
        </div>
      )}
      <div class="workspace">
        <aside class="navigation">
          <div class="panel-title">
            回路一覧<span>{networks.length}</span>
          </div>
          <div class="nav-list">
            {networks.map((network, index) => (
              <button
                key={network.id}
                class={`nav-item${network.id === selectedNetwork ? ' active' : ''}`}
                onClick={() => moveTo(index, network.instructions[0])}
                onContextMenu={(e) => blockRangeMenu(e, blockRangeText([network]))}
              >
                <span class="number">{String(index + 1).padStart(3, '0')}</span>
                <div>
                  <strong>
                    {network.statement.split('\n')[0] ||
                      `元ファイル ${network.instructions[0].sourceLine}行`}
                  </strong>
                  <small>
                    {network.actions
                      .map((action) =>
                        [action.instruction.opcode, ...action.instruction.operands].join(' '),
                      )
                      .join(' / ')}
                  </small>
                </div>
              </button>
            ))}
          </div>
        </aside>
        <div
          ref={viewport}
          class="kv-diagram"
          onScroll={(event) => {
            setScrollTop(event.currentTarget.scrollTop);
            closeInstructionMenu();
          }}
        >
          {busy && (
            <div class="kv-loading" role="status">
              {progress}
            </div>
          )}
          <div
            class="kv-canvas"
            style={{ height: dimensions.total, minWidth: LADDER_WIDTH * zoom }}
          >
            {visible.map((index) => (
              <section
                key={networks[index].id}
                class="kv-network"
                data-network={networks[index].id}
                style={{ top: dimensions.offsets[index], height: dimensions.heights[index] }}
              >
                <HorizontalScroll
                  enabled={scrolling[index]}
                  width={LADDER_WIDTH * zoom}
                  contentWidth={drawings[index].width * zoom}
                  height={dimensions.heights[index]}
                  label={`回路 元ファイル ${networks[index].instructions[0].sourceLine}行 横スクロール`}
                >
                  <KeyenceLadder
                    drawing={drawings[index]}
                    zoom={zoom}
                    selected={selected}
                    onSelect={select}
                    onContextMenu={contextMenu}
                    onToggleScript={toggleScript}
                  />
                </HorizontalScroll>
              </section>
            ))}
          </div>
        </div>
        <DetailPanel>
          {instruction && (
            <div class="detail-content">
              <div class="eyebrow">元ファイル {instruction.sourceLine}行</div>
              <h2>{instruction.opcode}</h2>
              <dl>
                {instruction.operands.length > 0 && (
                  <>
                    <dt>オペランド</dt>
                    <dd>
                      {instruction.operands.map((operand, index) => (
                        <div key={index} class="operand">
                          <span>{index + 1}</span>
                          <code>{operand}</code>
                        </div>
                      ))}
                    </dd>
                  </>
                )}
                {keyenceInstructionComment(instruction, program) && (
                  <>
                    <dt>コメント</dt>
                    <dd>{keyenceInstructionComment(instruction, program)}</dd>
                  </>
                )}
                <dt>元ファイル</dt>
                <dd>{program.name}</dd>
              </dl>
            </div>
          )}
        </DetailPanel>
      </div>
      <footer>
        <span class="status-dot" />
        {program.moduleName || program.name} · {program.instructions.length} 命令 ·{' '}
        {networks.length} 回路
        {Object.keys(program.deviceComments).length > 0 &&
          ` · コメント ${Object.keys(program.deviceComments).length}件`}
      </footer>
    </div>
  );
}
