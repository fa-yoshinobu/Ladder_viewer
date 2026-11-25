import { requireValue } from './requireValue';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { type DeviceComments } from './comments';
import { comparisonDisplayProgram, type ComparisonDisplay } from './comparisonDisplay';
import { type CompareSide } from './ComparisonView';
import type { KeyenceViewerProgram } from './keyence/viewerLayout';
import { ROW, fitLadderZoom, type LadderViewMode } from './layout';
import type { Instruction } from './model';
import { isRemoteMitsubishi, storedNetworkSize, type MitsubishiDocument } from './mitsubishiViewer';
import { useMitsubishiCircuits } from './useMitsubishiCircuits';
import { instructionDrawingOffset } from './NetworkDrawing';
import { describeNetworkSize } from './networkDimensions';
import { buildSearchIndex, searchInstructions, type SearchMode } from './search';
import { useZoom } from './useZoom';
import { visibleRange } from './visibleRange';
import { useSetting } from './settings';
import { useDebouncedValue } from './useDebouncedValue';
export function useMitsubishiNavigation(
  program: MitsubishiDocument | null,
  keyenceProgram: KeyenceViewerProgram | null,
  deviceComments: DeviceComments,
) {
  const [showComments, setShowComments] = useSetting('showComments');
  const [selected, setSelected] = useState<Instruction | null>(null);
  const [selectedSide, setSelectedSide] = useState<CompareSide>('source');
  const [comparisonDisplay, setComparisonDisplay] = useState<ComparisonDisplay>('both');
  const [searchQuery, setSearchQuery] = useState('');
  const settledQuery = useDebouncedValue(searchQuery);
  const previousSearch = useRef<{
    query: string;
    mode: SearchMode;
    program: MitsubishiDocument | null;
  } | null>(null);
  const comparisonPosition = useRef<{ step: string; id: string; side: CompareSide } | null>(null);
  const pendingDisplayPosition = useRef<{ step: string; id: string; side: CompareSide } | null>(
    null,
  );
  const [searchMode, setSearchMode] = useState<SearchMode>('partial');
  const [searchCurrent, setSearchCurrent] = useState(-1);
  const [comparisonNavigation, setComparisonNavigation] = useState<{
    instructionId: string;
    side: CompareSide;
    request: number;
  }>();
  const jumpRequest = useRef(0);
  const pendingInstruction = useRef<{ id: string; ownerId: string } | null>(null);
  const pendingFit = useRef(false);
  const comparisonWidth = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState('');
  const { zoom, setZoom, zoomIn, zoomOut } = useZoom(
    1,
    !!program?.comparison && comparisonDisplay === 'both',
  );
  const [viewMode, setViewMode] = useSetting('viewMode');
  const viewAnchor = useRef<string | null>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 800 });
  const scroll = useRef<HTMLDivElement>(null);
  const [requestedJump, setRequestedJump] = useState<{
    program: MitsubishiDocument;
    index: number;
    id: string;
    side: CompareSide;
  } | null>(null);
  function resetKeyence() {
    setRequestedJump(null);
    comparisonPosition.current = null;
    pendingDisplayPosition.current = null;
    pendingFit.current = false;
    pendingInstruction.current = null;
    setComparisonNavigation(undefined);

    setSelected(null);
  }
  function resetProgram(next: MitsubishiDocument) {
    setRequestedJump(null);
    comparisonPosition.current = null;
    pendingDisplayPosition.current = null;
    pendingFit.current = true;
    setComparisonNavigation(undefined);
    pendingInstruction.current = null;

    setSelected(null);
    setSelectedSide('source');
    setActive(next.networks[0]?.id ?? '');
    setComparisonDisplay('both');
    setZoom(next.comparison ? 0.5 : 1);
    viewAnchor.current = null;
    const element = scroll.current;
    element?.scrollTo(0, 0);
    setViewport({ top: element?.scrollTop ?? 0, height: element?.clientHeight ?? 800 });
  }
  const commentCount = useMemo(() => Object.keys(deviceComments).length, [deviceComments]);
  const rowHeight = showComments && commentCount ? 72 : ROW;
  const comparison = program?.comparison;
  const showComparison = !!comparison && comparisonDisplay === 'both';
  const displayedProgram = useMemo(
    () =>
      program && !isRemoteMitsubishi(program)
        ? comparisonDisplayProgram(program, comparisonDisplay)
        : program,
    [program, comparisonDisplay],
  );
  const sizes = useMemo(() => {
    if (!displayedProgram || showComparison) return [];
    if (isRemoteMitsubishi(displayedProgram))
      return displayedProgram.networks.map((n, index) => ({
        n,
        local: null,
        ...storedNetworkSize(displayedProgram, index, rowHeight, viewMode),
      }));
    return displayedProgram.networks.map((n) => ({
      n,
      local: n,
      ...describeNetworkSize(n, rowHeight, viewMode),
    }));
  }, [displayedProgram, showComparison, rowHeight, viewMode]);
  const { layouts, minWidth } = useMemo(() => {
    let top = 8,
      minWidth = 0;
    const layouts = sizes.map((size) => {
      const item = {
        n: size.n,
        local: size.local,
        top,
        height: size.height * zoom + size.title * zoom + size.warnings + size.scrollbar,
        width: size.width * zoom,
      };
      top += item.height;
      minWidth = Math.max(minWidth, item.width + 24);
      return item;
    });
    return { layouts, minWidth };
  }, [sizes, zoom]);
  const getSearchIndex = useMemo(() => {
    let index: ReturnType<typeof buildSearchIndex> | undefined;
    return () =>
      (index ??= program ? buildSearchIndex(program, deviceComments, comparisonDisplay) : []);
  }, [program, deviceComments, comparisonDisplay]);
  const searchResults = useMemo(
    () =>
      settledQuery.trim() ? searchInstructions(getSearchIndex(), settledQuery, searchMode) : [],
    [getSearchIndex, settledQuery, searchMode],
  );
  const searchHeadings = useMemo(
    () =>
      searchResults.map((result) => ({
        heading:
          (comparison ? (result.side === 'source' ? '比較元' : '比較先') + ' · ' : '') +
          'STEP ' +
          (result.instruction.step || '—') +
          ' · ' +
          [result.instruction.op, ...result.instruction.operands].join(' '),
      })),
    [searchResults, comparison],
  );
  useEffect(() => {
    const previous = previousSearch.current;
    previousSearch.current = { query: settledQuery, mode: searchMode, program };
    if (
      !previous ||
      previous.query !== settledQuery ||
      previous.mode !== searchMode ||
      previous.program !== program
    ) {
      setSearchCurrent(searchResults.length ? 0 : -1);
      const hit = searchResults[0];
      if (hit) navigateInstruction(hit.instruction.id, hit.side);
    } else {
      const index = searchResults.findIndex((hit) => hit.instruction.step === selected?.step);
      setSearchCurrent(index);
    }
  }, [searchResults]);
  useLayoutEffect(() => {
    const pending = pendingInstruction.current,
      element = scroll.current;
    if (!pending || !element || showComparison) return;
    pendingInstruction.current = null;
    const target =
      element.querySelector(`[data-instruction-id="${CSS.escape(pending.id)}"]`) ??
      element.querySelector(`[data-instruction-id="${CSS.escape(pending.ownerId)}"]`);
    target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    setViewport({ top: element.scrollTop, height: element.clientHeight });
  });
  const selectedProgram = selectedSide === 'target' && comparison ? comparison.target : program;
  const total = layouts.at(-1);
  const [firstVisible, endVisible] = visibleRange(
    layouts.length,
    (index) => requireValue(layouts[index]),
    viewport.top - 400,
    viewport.top + viewport.height + 400,
  );
  const remote = program && isRemoteMitsubishi(program) ? program : null;
  const {
    cache,
    error: drawingError,
    dismissDrawingError,
  } = useMitsubishiCircuits(
    remote,
    firstVisible,
    endVisible,
    requestedJump && requestedJump.program === program ? requestedJump.index : -1,
  );
  const visible = layouts.slice(firstVisible, endVisible).flatMap((item) => {
    const network = item.local ?? cache.get(item.n.id);
    return network ? [{ ...item, n: network }] : [];
  });
  useLayoutEffect(() => {
    if (
      requestedJump &&
      requestedJump.program === program &&
      cache.has(program.networks[requestedJump.index]!.id)
    )
      navigateInstruction(requestedJump.id, requestedJump.side);
  });
  const previousGeometry = useRef({ program, layouts });
  useLayoutEffect(() => {
    const anchor = viewAnchor.current;
    viewAnchor.current = null;
    const previous = previousGeometry.current;
    const old =
      previous.program === program
        ? previous.layouts.find((item) => item.top + item.height > viewport.top)
        : undefined;
    const layout = layouts.find((item) => item.n.id === (anchor ?? old?.n.id));
    const element = scroll.current;
    if (layout) {
      element?.scrollTo({
        top:
          layout.top +
          (!anchor && old
            ? (Math.max(0, viewport.top - old.top) / Math.max(1, old.height)) * layout.height
            : 0),
      });
      setActive(layout.n.id);
    }
    if (element) setViewport({ top: element.scrollTop, height: element.clientHeight });
    previousGeometry.current = { program, layouts };
  }, [layouts]);
  useLayoutEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setViewport({ top: element.scrollTop, height: element.clientHeight }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [showComparison, keyenceProgram]);
  function fitToWidth() {
    if (!program) return false;
    const element = showComparison ? comparisonWidth.current : scroll.current;
    if (!element || element.clientWidth <= 0) return false;
    setZoom(fitLadderZoom(element.clientWidth, showComparison));
    return true;
  }
  useLayoutEffect(() => {
    if (!program || !pendingFit.current) return;
    const element = showComparison ? comparisonWidth.current : scroll.current;
    if (!element) return;
    let observer: ResizeObserver | undefined;
    const fit = () => {
      if (!pendingFit.current) {
        observer?.disconnect();
        return;
      }
      if (!fitToWidth()) return;
      pendingFit.current = false;
      observer?.disconnect();
    };
    fit();
    if (!pendingFit.current) return;
    observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer?.disconnect();
  }, [program, showComparison, comparisonDisplay]);
  useLayoutEffect(() => {
    const element = showComparison ? comparisonWidth.current : scroll.current;
    if (!program || !element) return;
    let width = element.offsetWidth;
    const observer = new ResizeObserver(() => {
      if (element.offsetWidth === width) return;
      width = element.offsetWidth;
      fitToWidth();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [program, showComparison]);
  function changeComparisonDisplay(next: ComparisonDisplay) {
    setComparisonNavigation(undefined);
    pendingInstruction.current = null;
    if (!program || !comparison || next === comparisonDisplay) return;
    const anchor = showComparison
      ? comparisonPosition.current
      : (() => {
          const current = layouts.find((item) => item.top + item.height > viewport.top + 2);
          const instruction = current?.n.instructions[0];
          return instruction
            ? { id: instruction.id, step: instruction.step, side: selectedSide }
            : null;
        })();
    pendingDisplayPosition.current =
      anchor ?? (selected ? { id: selected.id, step: selected.step, side: selectedSide } : null);
    setComparisonDisplay(next);
    viewAnchor.current = null;
    pendingFit.current = true;
  }
  useLayoutEffect(() => {
    const anchor = pendingDisplayPosition.current;
    if (!anchor || !program) return;
    const container = showComparison ? comparisonWidth.current : scroll.current;
    if (container && zoom !== fitLadderZoom(container.clientWidth, showComparison)) return;
    const side = comparisonDisplay === 'both' ? anchor.side : comparisonDisplay;
    const original = side === 'target' && comparison ? comparison.target : program;
    const instruction =
      original.instructions.find((item) => item.id === anchor.id) ??
      original.instructions.find((item) => item.step === anchor.step);
    if (!instruction) {
      pendingDisplayPosition.current = null;
      return;
    }
    pendingDisplayPosition.current = null;
    navigateInstruction(instruction.id, side);
  }, [layouts, comparisonDisplay]);
  function rememberComparisonPosition(instruction: Instruction, side: CompareSide) {
    comparisonPosition.current = { id: instruction.id, step: instruction.step, side };
  }
  function chooseDisplayedInstruction(instruction: Instruction) {
    setRequestedJump(null);
    setSelected(instruction);
    setSelectedSide(comparison && comparisonDisplay === 'target' ? 'target' : 'source');
  }
  function changeViewMode(next: LadderViewMode) {
    if (next === viewMode) return;
    const top = scroll.current?.scrollTop ?? viewport.top;
    const selectedLayout = layouts.find((item) =>
      item.n.instructions.some((i) => i.id === selected?.id),
    );
    const current =
      selectedLayout &&
      selectedLayout.top < top + viewport.height &&
      selectedLayout.top + selectedLayout.height > top
        ? selectedLayout
        : layouts.find((item) => item.top + item.height > top);
    viewAnchor.current = current?.n.id ?? null;
    setViewMode(next);
  }
  function jump(id: string) {
    setRequestedJump(null);
    const layout = layouts.find((item) => item.n.id === id),
      element = scroll.current;
    if (layout && element) {
      element.scrollTo({ top: layout.top });
      setViewport({ top: element.scrollTop, height: element.clientHeight });
      setActive(id);
    }
  }
  function navigateInstruction(instructionId: string, side: CompareSide) {
    const original = side === 'target' && comparison ? comparison.target : program;
    const instruction = original?.instructions.find((i) => i.id === instructionId);
    if (!instruction) return;
    if (showComparison) {
      setComparisonNavigation({ instructionId, side, request: ++jumpRequest.current });
      return;
    }
    const index = layouts.findIndex(
      (item) =>
        item.n.instructions.some((i) => i.id === instructionId) ||
        item.n.pointer?.id === instructionId,
    );
    const layout = layouts[index];
    const element = scroll.current;
    if (!layout || !element) return;
    const network = layout.local ?? cache.get(layout.n.id);
    if (!network && program) {
      setRequestedJump({ program, index, id: instructionId, side });
      return;
    }
    if (!network) return;
    setRequestedJump(null);
    const owner = network.actions.find((action) =>
      action.instruction.pins?.some((pin) => pin.id === instructionId),
    )?.instruction;
    pendingInstruction.current = { id: instructionId, ownerId: owner?.id ?? instructionId };
    element.scrollTo({
      top: layout.top + instructionDrawingOffset(network, instructionId, rowHeight, zoom, viewMode),
    });
    setViewport({ top: element.scrollTop, height: element.clientHeight });
    setActive(layout.n.id);
    setSelected(instruction);
    setSelectedSide(side);
  }
  function moveSearch(delta: number) {
    if (!searchResults.length) return;
    const next =
      searchCurrent < 0
        ? delta < 0
          ? searchResults.length - 1
          : 0
        : (searchCurrent + delta + searchResults.length) % searchResults.length;
    setSearchCurrent(next);
    const hit = requireValue(searchResults[next]);
    navigateInstruction(hit.instruction.id, hit.side);
  }
  return {
    drawingError,
    dismissDrawingError,
    showComments,
    setShowComments,
    selected,
    setSelected,
    selectedSide,
    setSelectedSide,
    comparisonDisplay,
    searchQuery,
    setSearchQuery,
    searchMode,
    setSearchMode,
    searchCurrent,
    comparisonNavigation,
    rememberComparisonPosition,
    comparisonWidth,
    active,
    zoom,
    setZoom,
    zoomIn,
    zoomOut,
    viewMode,
    setViewport,
    scroll,
    commentCount,
    rowHeight,
    comparison,
    showComparison,
    displayedProgram,
    minWidth,
    searchHeadings,
    selectedProgram,
    total,
    visible,
    fitToWidth,
    changeComparisonDisplay,
    chooseDisplayedInstruction,
    changeViewMode,
    jump,
    navigateInstruction,
    moveSearch,
    resetProgram,
    resetKeyence,
  };
}
