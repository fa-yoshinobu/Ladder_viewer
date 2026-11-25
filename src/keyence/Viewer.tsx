import { requireValue } from '../requireValue';
import { DetailPanel } from '../DetailPanel';
import { blockRangeMenu } from '../blockRangeCopy';
import {
  openCommentList,
  openCommentWindow,
  showInstructionMenu,
  closeInstructionMenu,
} from '../CommentList';
import { type CommentListData, commentListRequest } from '../commentListData';
import { normalizeSearchText as normalize, searchTextMatches } from '../searchText';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { KeyenceInstruction } from './model';
import { requestKeyenceInfo, type KeyenceViewerProgram, type KeyenceRow } from './viewerLayout';
import { useViewerLayout } from './useViewerLayout';
import { nativeCsvBridge } from '../nativeCsv';
import { keyenceInstructionComment, keyenceSymbolOwns } from './layout';
import { LADDER_WIDTH, SCROLLBAR_HEIGHT } from '../ladderMetrics';
import { HorizontalScroll } from '../HorizontalScroll';
import { KeyenceLadder } from './Ladder';
import { SearchBar } from '../SearchBar';
import { ViewerHeader } from '../ViewerHeader';
import { keyenceInstructionCopyText } from './instructionCopy';
import { ST_HEADER_HEIGHT, ST_ROW_HEIGHT } from './structuredText';
import { StColorToggle } from '../StColorToggle';
import { ViewerToolbar } from '../ViewerToolbar';
import { useZoom } from '../useZoom';
import { fitZoom } from '../zoom';
import { VirtualNetworkList } from '../VirtualNetworkList';
import { visibleRange } from '../visibleRange';
import { useSetting } from '../settings';
import { MessageBanner } from '../MessageBanner';
import { useDebouncedValue } from '../useDebouncedValue';

interface Props {
  program: KeyenceViewerProgram;
  names: string[];
  busy: boolean;
  progress: string;
  error: string;
  warning: string;
  dismissError: () => void;
  dismissWarning: () => void;
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
const noMatches: KeyenceInstruction[] = [];
export function KeyenceViewer({
  program,
  names,
  busy,
  progress,
  error,
  warning,
  dismissError,
  dismissWarning,
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
  const [showComments, setShowComments] = useSetting('showComments');
  const { zoom, setZoom, zoomIn, zoomOut } = useZoom();
  const [size, setSize] = useState({ width: 1000, height: 800 }),
    [scrollTop, setScrollTop] = useState(0);
  const [lastSelected, setLastSelected] = useState(program.first);
  const [selected, setSelected] = useState(''),
    [selectedNetwork, setSelectedNetwork] = useState('');
  const [query, setQuery] = useState(''),
    [searchIndex, setSearchIndex] = useState(-1);
  const settledQuery = useDebouncedValue(query);
  const [viewMode, setViewMode] = useSetting('viewMode');
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
  const menuRequest = useRef(0);
  const commentList = useMemo(() => {
    let list: Promise<CommentListData> | undefined;
    return () => (list ??= requestKeyenceInfo(program, { action: 'comments' }));
  }, [program]);
  const {
    rows: networks,
    drawings,
    requestDrawings,
    error: layoutError,
    dismissError: dismissLayoutError,
  } = useViewerLayout(
    program,
    expandedScripts,
    showComments,
    viewMode,
    scrollTop,
    size.height,
    zoom,
  );
  const [queuedJump, setQueuedJump] = useState<{
    rows: KeyenceRow[];
    index: number;
    item?: KeyenceInstruction;
  }>();
  const dimensions = useMemo(() => {
    let total = 8;
    const offsets: number[] = [],
      heights: number[] = [];
    for (const row of networks) {
      offsets.push(total);
      const height = Math.ceil(row.height * zoom) + (row.horizontal ? SCROLLBAR_HEIGHT : 0);
      heights.push(height);
      total += height;
    }
    return { offsets, heights, total: total + 8 };
  }, [networks, zoom]);
  const visible = useMemo(() => {
    const { offsets, heights } = dimensions;
    const start = Math.max(0, scrollTop - size.height),
      end = scrollTop + size.height * 2;
    const [first, last] = visibleRange(
      offsets.length,
      (index) => ({ top: requireValue(offsets[index]), height: requireValue(heights[index]) }),
      start,
      end,
    );
    return Array.from({ length: last - first }, (_, index) => first + index);
  }, [dimensions, scrollTop, size.height]);
  useLayoutEffect(() => {
    requestDrawings(queuedJump?.rows === networks ? [...visible, queuedJump.index] : visible);
  }, [visible, queuedJump, drawings, networks]);
  const instructionNetworks = useMemo(
    () =>
      new Map(
        networks.flatMap((row, index) => row.instructionIds.map((id) => [id, index] as const)),
      ),
    [networks],
  );
  const owner = instructionNetworks.get(selected);
  const instruction =
    (owner === undefined
      ? undefined
      : drawings.get(owner)?.network.instructions.find((i) => i.id === selected)) ??
    (lastSelected.id === selected ? lastSelected : undefined);
  const [search, setSearch] = useState<{
    program: KeyenceViewerProgram;
    query: string;
    mode: typeof searchMode;
    matches: KeyenceInstruction[];
  }>();
  useLayoutEffect(() => {
    if (!normalize(settledQuery)) return;
    let active = true;
    requestKeyenceInfo(program, { action: 'search', query: settledQuery, mode: searchMode }).then(
      (matches) => {
        if (active) setSearch({ program, query: settledQuery, mode: searchMode, matches });
      },
      (err: Error) => {
        if (active) setCopyError(err.message);
      },
    );
    return () => {
      active = false;
    };
  }, [program, settledQuery, searchMode]);
  const matches =
    search?.program === program && search.query === settledQuery && search.mode === searchMode
      ? search.matches
      : noMatches;
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
    setLastSelected(program.first);
    setSelected(program.first.id);
    setSelectedNetwork('');
    setQueuedJump(undefined);
    setScrollTop(0);
    closeInstructionMenu();
    setPendingTarget(null);
    if (viewport.current) viewport.current.scrollTop = 0;
    return () => {
      menuRequest.current++;
      closeInstructionMenu();
    };
  }, [program]);
  useEffect(() => {
    if (networks.length && !selectedNetwork) setSelectedNetwork(networks[0]!.id);
  }, [networks, selectedNetwork]);
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
    const drawing = drawings.get(index);
    if (!drawing) return;
    const symbol = drawing.symbols.find((symbol) => keyenceSymbolOwns(symbol, pendingTarget.id));
    const networkElement = element.querySelector<HTMLElement>(
      '[data-network="' + requireValue(networks[index]).id + '"]',
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
    const drawing = drawings.get(index);
    item ??= drawing?.network.instructions[0];
    const script = requireValue(networks[index]).script;
    if (item && script && !script.expanded && script.instructionIds.includes(item.id)) {
      setExpandedScripts((old) => new Set([...old, script.id]));
      setScriptTarget(item);
      return;
    }
    if (!drawing) {
      setQueuedJump({ rows: networks, index, item });
      return;
    }
    setQueuedJump(undefined);
    setSelectedNetwork(requireValue(networks[index]).id);
    if (item) {
      setSelected(item.id);
      setLastSelected(item);
      setPendingTarget(item);
    }
    const element = viewport.current;
    if (element) {
      const symbol = item && drawing.symbols.find((symbol) => keyenceSymbolOwns(symbol, item.id));
      const stLine =
        drawing.st && item?.st && normalize(query)
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
        ? (drawing.stRows?.findIndex((row) => row.sourceLine === stLine.sourceLine) ?? 0)
        : 0;
      const target =
        requireValue(dimensions.offsets[index]) +
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
    if (queuedJump && queuedJump.rows === networks && drawings.has(queuedJump.index))
      moveTo(queuedJump.index, queuedJump.item);
  }, [drawings, queuedJump, networks]);
  useLayoutEffect(() => {
    if (!scriptTarget) return;
    const index = instructionNetworks.get(scriptTarget.id);
    if (index !== undefined) {
      const script = networks[index]?.script;
      if (script && !script.expanded && script.instructionIds.includes(scriptTarget.id)) return;
      setScriptTarget(null);
      moveTo(index, scriptTarget);
    }
  }, [scriptTarget, networks]);
  const toggleScript = (id: string) => {
    const index = networks.findIndex((n) => n.script?.id === id),
      top = index >= 0 ? dimensions.offsets[index] : 0;
    const instructionId = networks[index]?.first;
    setExpandedScripts((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (instructionId) {
      setSelected(instructionId);
      const first = drawings.get(index)?.network.instructions[0];
      if (first) setLastSelected(first);
      setSelectedNetwork(instructionId);
    }
    if (viewport.current) {
      viewport.current.scrollTop = Math.min(viewport.current.scrollTop, requireValue(top));
      setScrollTop(viewport.current.scrollTop);
    }
  };
  const select = (item: KeyenceInstruction) => {
    setSelected(item.id);
    setLastSelected(item);
    const index = instructionNetworks.get(item.id);
    if (index !== undefined) setSelectedNetwork(requireValue(networks[index]).id);
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
    const item = requireValue(matches[index]),
      networkIndex = instructionNetworks.get(item.id);
    if (networkIndex !== undefined) moveTo(networkIndex, item);
  };
  useLayoutEffect(() => {
    setSearchIndex(matches.length ? 0 : -1);
    const item = matches[0],
      index = item && instructionNetworks.get(item.id);
    if (item && index !== undefined) moveTo(index, item);
  }, [matches, !!networks.length]);
  const previousGeometry = useRef({ program, dimensions, networks });
  useLayoutEffect(() => {
    const index = viewAnchor.current,
      element = viewport.current;
    const previous = previousGeometry.current;
    previousGeometry.current = { program, dimensions, networks };
    if (!element) return;
    viewAnchor.current = null;
    if (index !== null) element.scrollTop = dimensions.offsets[index] ?? 0;
    else if (previous.program === program && previous.dimensions !== dimensions) {
      const old = previous.dimensions;
      const [first] = visibleRange(
        old.offsets.length,
        (index) => ({
          top: requireValue(old.offsets[index]),
          height: requireValue(old.heights[index]),
        }),
        scrollTop + 2,
        scrollTop + size.height,
      );
      const id = previous.networks[first]?.id;
      const next = networks.findIndex((network) => network.id === id);
      if (next >= 0)
        element.scrollTop =
          requireValue(dimensions.offsets[next]) +
          (Math.max(0, scrollTop - requireValue(old.offsets[first])) /
            Math.max(1, requireValue(old.heights[first]))) *
            requireValue(dimensions.heights[next]);
    }
    setScrollTop(element.scrollTop);
  }, [dimensions]);
  const changeViewMode = (next: 'wrap' | 'scroll') => {
    if (next === viewMode) return;
    const selectedIndex = networks.findIndex((network) => network.id === selectedNetwork);
    const selectedVisible =
      selectedIndex >= 0 &&
      requireValue(dimensions.offsets[selectedIndex]) < scrollTop + size.height &&
      requireValue(dimensions.offsets[selectedIndex]) +
        requireValue(dimensions.heights[selectedIndex]) >
        scrollTop;
    viewAnchor.current = selectedVisible
      ? selectedIndex
      : Math.max(
          0,
          dimensions.offsets.findIndex(
            (offset, index) => offset + requireValue(dimensions.heights[index]) > scrollTop,
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
    const request = ++menuRequest.current;
    void commentList().then(
      (list) => {
        if (request !== menuRequest.current) return;
        showInstructionMenu(
          event,
          copyText(item),
          commentListRequest(list, item.operands, dark),
          () => setCopyError('コピーできませんでした。'),
        );
      },
      (err: Error) => setCopyError(err.message),
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
        onComments={() => {
          const popup = nativeCsvBridge() ? undefined : openCommentWindow();
          void commentList().then(
            (list) =>
              openCommentList(commentListRequest(list, instruction?.operands, dark)!, popup),
            (err: Error) => {
              popup?.close();
              setCopyError(err.message);
            },
          );
        }}
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
            hasComments={program.hasComments}
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
            {program.hasStructuredText && <StColorToggle />}
          </ViewerToolbar>
        </div>
      </div>
      <MessageBanner
        text={error || copyError || layoutError}
        dismiss={() => {
          setCopyError('');
          dismissLayoutError();
          dismissError();
        }}
      />
      <MessageBanner text={warning} warning dismiss={dismissWarning} />
      <div class="workspace">
        <aside class="navigation">
          <div class="panel-title">
            回路一覧<span>{networks.length}</span>
          </div>
          <VirtualNetworkList
            items={networks}
            active={selectedNetwork}
            renderItem={(network, index) => (
              <button
                key={network.id}
                data-network-id={network.id}
                class={`nav-item${network.id === selectedNetwork ? ' active' : ''}`}
                onClick={() => moveTo(index)}
                onContextMenu={(e) => blockRangeMenu(e, network.range)}
              >
                <span class="number">{String(index + 1).padStart(3, '0')}</span>
                <div>
                  <strong>{network.title}</strong>
                  <small>{network.actions}</small>
                </div>
              </button>
            )}
          />
        </aside>
        <div
          ref={viewport}
          class="kv-diagram"
          onScroll={(event) => {
            setScrollTop(event.currentTarget.scrollTop);
            menuRequest.current++;
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
            {visible
              .filter((index) => drawings.has(index))
              .map((index) => (
                <section
                  key={requireValue(networks[index]).id}
                  class="kv-network"
                  data-network={requireValue(networks[index]).id}
                  style={{ top: dimensions.offsets[index], height: dimensions.heights[index] }}
                >
                  <HorizontalScroll
                    enabled={requireValue(networks[index]).horizontal}
                    width={LADDER_WIDTH * zoom}
                    contentWidth={requireValue(drawings.get(index)).width * zoom}
                    height={requireValue(dimensions.heights[index])}
                    label={`回路 元ファイル ${requireValue(networks[index]).firstLine}行 横スクロール`}
                  >
                    <KeyenceLadder
                      drawing={requireValue(drawings.get(index))}
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
        {program.moduleName || program.name} · {program.instructionCount}
        {' 命令 ·'} {networks.length}
        {' 回路'}
        {Object.keys(program.deviceComments).length > 0 &&
          ` · コメント ${Object.keys(program.deviceComments).length}件`}
      </footer>
    </div>
  );
}
