import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { openCommentList } from './CommentList';
import { keyenceCommentList, mitsubishiCommentList, commentListRequest } from './commentListData';
import type { BatchResult, CsvInput } from './batch';
import { nativeCsvBridge, decodeNativeCsvFiles, type NativeCsvSelection } from './nativeCsv';
import {
  directInputs,
  pairDirectPrograms,
  type DirectResult,
  type DirectPair,
} from './directComparison';
import { mitsubishiCompareDrawing, projectMitsubishiInstruction } from './mitsubishiCompareDrawing';
import { keyenceCompareDrawing, projectKeyenceInstruction } from './keyence/compareDrawing';
import { DirectComparisonView } from './DirectComparisonView';
import type { DirectSelection, DirectNavigation } from './directDrawing';
import type { CompareSide } from './compareCore';
import { normalizeSearchText, searchTextMatches } from './searchText';
import { droppedInputs } from './dropInputs';
import { ViewerHeader } from './ViewerHeader';
import { differenceLabels } from './model';
import { SearchBar } from './SearchBar';
import { LADDER_WIDTH } from './ladderMetrics';
import { StColorToggle } from './StColorToggle';
import { keyenceScriptRegions } from './keyence/scriptDisplay';
interface Props {
  dark: boolean;
  palette: string;
  changePalette: (value: string) => void;
  toggleTheme: () => void;
  back: () => void;
  initial?: NativeCsvSelection['comparison'];
}
interface SideInput {
  batch: BatchResult | null;
  busy: boolean;
  error: string;
  progress: string;
}
const blank = (): SideInput => ({ batch: null, busy: false, error: '', progress: '' });
const noExpandedScripts = new Set<string>();
export function DirectComparisonWorkspace({
  dark,
  palette,
  changePalette,
  toggleTheme,
  back,
  initial,
}: Props) {
  const [showUnchanged, setShowUnchanged] = useState(true),
    [overview, setOverview] = useState<Record<string, boolean>>({}),
    [indexing, setIndexing] = useState(false),
    [dragSide, setDragSide] = useState<CompareSide | null>(null);
  const overviewToken = useRef(0),
    lastCompared = useRef<DirectPair | null>(null),
    submittedPair = useRef<DirectPair | null>(null);
  const [source, setSource] = useState<SideInput>(blank),
    [target, setTarget] = useState<SideInput>(blank),
    [pairId, setPairId] = useState('');
  const [result, setResult] = useState<DirectResult | null>(null),
    [comparing, setComparing] = useState(false),
    [compareError, setCompareError] = useState('');
  const [display, setDisplay] = useState<'both' | 'source' | 'target'>('both'),
    [comments, setComments] = useState(true),
    [zoom, setZoom] = useState(0.5),
    [viewMode, setViewMode] = useState<'wrap' | 'scroll'>('wrap');
  const [query, setQuery] = useState(''),
    [searchMode, setSearchMode] = useState<'partial' | 'exact'>('partial'),
    [current, setCurrent] = useState(-1);
  const [selected, setSelected] = useState<DirectSelection | null>(null),
    [navigation, setNavigation] = useState<DirectNavigation | null>(null),
    [menu, setMenu] = useState<{ x: number; y: number; selection: DirectSelection } | null>(null);
  const [scriptExpansion, setScriptExpansion] = useState<{
    result: DirectResult | null;
    ids: Set<string>;
  }>(() => ({ result: null, ids: new Set() }));
  const expandedScripts =
    scriptExpansion.result === result ? scriptExpansion.ids : noExpandedScripts;
  const setExpandedScripts = (update: (old: Set<string>) => Set<string>) =>
    setScriptExpansion((old) => ({
      result,
      ids: update(old.result === result ? old.ids : noExpandedScripts),
    }));
  const worker = useRef<Worker | null>(null),
    sequence = useRef(Date.now()),
    loads = useRef(new Map<number, CompareSide>()),
    comparisonToken = useRef(0),
    width = useRef<HTMLDivElement>(null),
    displayRef = useRef(display);
  displayRef.current = display;
  const bridge = nativeCsvBridge(),
    busy = source.busy || target.busy;
  const setSide = (side: CompareSide, update: (old: SideInput) => SideInput) =>
    (side === 'source' ? setSource : setTarget)(update);
  const inputs = useMemo(
    () => ({
      source: source.batch ? directInputs(source.batch) : [],
      target: target.batch ? directInputs(target.batch) : [],
    }),
    [source.batch, target.batch],
  );
  const pairs = useMemo(
    () =>
      pairDirectPrograms(inputs.source, inputs.target).map((pair) =>
        !pair.source && source.batch?.errors.length
          ? { ...pair, error: '比較元に読込みエラーがあるため、比較先のみと判定できません。' }
          : !pair.target && target.batch?.errors.length
            ? { ...pair, error: '比較先に読込みエラーがあるため、比較元のみと判定できません。' }
            : pair,
      ),
    [inputs, source.batch, target.batch],
  );
  const listedPairs = useMemo(
    () => (showUnchanged ? pairs : pairs.filter((p) => overview[p.id] !== true)),
    [pairs, showUnchanged, overview],
  );
  const pair = listedPairs.find((pair) => pair.id === pairId) ?? listedPairs[0];
  const toggleScript = (id: string) =>
    setExpandedScripts((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const blocks = useMemo(
    () =>
      !result
        ? []
        : result.format === 'mitsubishi'
          ? mitsubishiCompareDrawing(
              result.program,
              result.sourceComments,
              result.targetComments,
              comments,
              zoom,
              viewMode,
              display,
            )
          : keyenceCompareDrawing(
              result.comparison,
              comments,
              zoom,
              viewMode,
              display,
              expandedScripts,
              toggleScript,
            ),
    [result, comments, zoom, viewMode, display, expandedScripts],
  );
  const revealScript = (id: string, side: CompareSide) => {
    const script = blocks
      .flatMap((b) => b[side])
      .find((c) => c.script && !c.script.expanded && c.script.instructionIds.includes(id))?.script;
    if (script) setExpandedScripts((old) => new Set([...old, script.id]));
  };
  const commentLists = useMemo(
    () =>
      !result
        ? undefined
        : result.format === 'keyence'
          ? {
              source: keyenceCommentList(
                result.comparison.source,
                '比較元 · ' + result.comparison.source.name,
              ),
              target: keyenceCommentList(
                result.comparison.target,
                '比較先 · ' + result.comparison.target.name,
              ),
            }
          : {
              source: mitsubishiCommentList(
                result.program,
                result.sourceComments,
                '比較元 · ' + result.program.name,
              ),
              target: mitsubishiCommentList(
                result.program.comparison!.target,
                result.targetComments,
                '比較先 · ' + result.program.comparison!.target.name,
              ),
            },
    [result],
  );
  const searchEntries = useMemo(() => {
    if (!result) return [];
    if (result.format === 'mitsubishi')
      return (
        [
          ['source', result.program, result.sourceComments],
          ['target', result.program.comparison!.target, result.targetComments],
        ] as const
      ).flatMap(([side, p, table]) =>
        p.instructions.map((i) => ({ side, instruction: projectMitsubishiInstruction(i, table) })),
      );
    return (
      [
        ['source', result.comparison.source],
        ['target', result.comparison.target],
      ] as const
    ).flatMap(([side, p]) =>
      p.instructions.map((i) => ({ side, instruction: projectKeyenceInstruction(i, p) })),
    );
  }, [result]);
  const matches = useMemo(() => {
    const needle = normalizeSearchText(query);
    return searchEntries.filter(
      (entry) =>
        (display === 'both' || entry.side === display) &&
        searchTextMatches(
          [
            entry.instruction.op,
            ...entry.instruction.operands,
            [entry.instruction.op, ...entry.instruction.operands].join(' '),
            entry.instruction.line,
            entry.instruction.comment,
            entry.instruction.statement,
          ].map(normalizeSearchText),
          needle,
          searchMode,
        ),
    );
  }, [searchEntries, query, searchMode, display]);
  const headings = useMemo(
    () =>
      matches.map((m) => ({
        heading: `${m.side === 'source' ? '比較元' : '比較先'} · ${m.instruction.line} · ${[m.instruction.op, ...m.instruction.operands].join(' ')}`,
      })),
    [matches],
  );
  const navigate = (index: number) => {
    const hit = matches[index];
    if (!hit) return;
    revealScript(hit.instruction.id, hit.side);
    setCurrent(index);
    setNavigation({ id: hit.instruction.id, side: hit.side, request: ++sequence.current });
  };
  useEffect(() => {
    setCurrent(matches.length ? 0 : -1);
    if (matches.length) navigate(0);
  }, [matches]);
  const fit = () => {
    if (!width.current) return;
    const count = displayRef.current === 'both' ? 2 : 1;
    const available = (width.current.clientWidth - 170) / count;
    setZoom(
      Math.max(
        count === 2 ? 0.25 : 0.5,
        Math.min(1.5, Math.floor(((available - 24) / LADDER_WIDTH) * 100) / 100),
      ),
    );
  };
  useLayoutEffect(fit, [display, result]);
  useEffect(() => {
    const element = width.current;
    if (!element) return;
    let previous = 0;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth !== previous) {
        previous = element.clientWidth;
        fit();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const parser = new Worker(new URL('./parser.worker.ts', import.meta.url), { type: 'module' });
    worker.current = parser;
    parser.onmessage = (event) => {
      const message = event.data;
      if (message.token === overviewToken.current) {
        if (message.overview) {
          setOverview(message.overview);
          setIndexing(false);
        } else if (message.error) {
          setIndexing(false);
          setCompareError(message.error);
        }
        return;
      }
      if (message.token === comparisonToken.current) {
        setComparing(false);
        if (message.error) {
          setResult(null);
          setCompareError(message.error);
        } else if (message.comparison) {
          setResult(message.comparison);
          lastCompared.current = submittedPair.current;
          setCompareError('');
        }
        return;
      }
      const side = loads.current.get(message.token);
      if (!side) return;
      if (message.progress) {
        setSide(side, (old) => ({ ...old, progress: message.progress }));
        return;
      }
      loads.current.delete(message.token);
      if (message.error) {
        setSide(side, (old) => ({
          ...old,
          batch: null,
          busy: false,
          progress: '',
          error: message.error,
        }));
        return;
      }
      const batch = message.result as BatchResult;
      setSide(side, (old) => ({
        ...old,
        batch,
        busy: false,
        progress: '',
        error: [
          old.error,
          ...batch.errors.map((e) => e.name + ': ' + e.message),
          !directInputs(batch).length ? 'プログラムファイルがありません。' : '',
        ]
          .filter(Boolean)
          .join('\n'),
      }));
    };
    parser.onerror = () => {
      for (const side of ['source', 'target'] as const)
        setSide(side, (old) => ({
          ...old,
          busy: false,
          error: old.busy ? '解析処理でエラーが発生しました。再読み込みしてください。' : old.error,
        }));
      loads.current.clear();
      setComparing(false);
      setIndexing(false);
      setCompareError('解析処理でエラーが発生しました。再読み込みしてください。');
    };
    const receive = (event: MessageEvent<NativeCsvSelection>) => {
      const message = event.data,
        side = loads.current.get(message.token);
      if (!side || message.type !== 'csv-selection') return;
      if (message.status === 'loading') {
        setSide(side, (old) => ({ ...old, progress: 'ファイルを読み込んでいます…' }));
        return;
      }
      if (message.status === 'cancelled') {
        loads.current.delete(message.token);
        setSide(side, (old) => ({ ...old, busy: false, progress: '' }));
        return;
      }
      if (message.status === 'error') {
        loads.current.delete(message.token);
        setSide(side, (old) => ({
          ...old,
          busy: false,
          progress: '',
          error: message.error || 'ファイルを読み込めませんでした。',
        }));
        return;
      }
      try {
        submit(
          side,
          decodeNativeCsvFiles(message.files),
          message.token,
          message.warnings?.join('\n'),
        );
      } catch (error) {
        loads.current.delete(message.token);
        setSide(side, (old) => ({ ...old, busy: false, error: String(error), progress: '' }));
      }
    };
    bridge?.addEventListener('message', receive);
    if (initial) {
      for (const side of ['source', 'target'] as const) {
        try {
          submit(
            side,
            decodeNativeCsvFiles(initial[side]),
            undefined,
            (side === 'source' ? initial.sourceWarnings : initial.targetWarnings)?.join('\n'),
          );
        } catch (error) {
          setSide(side, (old) => ({ ...old, error: String(error) }));
        }
      }
    }
    const find = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('.search-query')?.focus();
      }
      if (event.key === 'Escape') {
        setMenu(null);
        setDragSide(null);
      }
    };
    window.addEventListener('keydown', find);
    return () => {
      parser.terminate();
      worker.current = null;
      bridge?.removeEventListener('message', receive);
      window.removeEventListener('keydown', find);
    };
  }, []);
  useEffect(() => {
    comparisonToken.current = ++sequence.current;
    if (busy) {
      setComparing(false);
      return;
    }
    if (pair && pair === lastCompared.current && result) return;
    setResult(null);
    setSelected(null);
    setNavigation(null);
    setMenu(null);
    setCompareError('');
    if (!source.batch || !target.batch || !inputs.source.length || !inputs.target.length || !pair) {
      lastCompared.current = null;
      setComparing(false);
      return;
    }
    submittedPair.current = pair;
    setComparing(true);
    worker.current?.postMessage({ action: 'compare', pair, token: comparisonToken.current });
  }, [pair, source.batch, target.batch, busy]);
  useEffect(() => {
    overviewToken.current = ++sequence.current;
    setOverview({});
    if (!source.batch || !target.batch || busy) {
      setIndexing(false);
      return;
    }
    setIndexing(true);
    worker.current?.postMessage({ action: 'compare-index', pairs, token: overviewToken.current });
  }, [pairs, source.batch, target.batch, busy]);
  function submit(
    side: CompareSide,
    files: CsvInput[],
    request = ++sequence.current,
    warning = '',
  ) {
    if (!files.length) throw new Error('CSV/MNMファイルがありません。');
    loads.current.set(request, side);
    setSide(side, (old) => ({
      ...old,
      batch: null,
      busy: true,
      error: warning,
      progress: 'ファイルを読み込んでいます…',
    }));
    worker.current?.postMessage(
      { files, token: request },
      files.map((file) => file.bytes),
    );
  }
  function open(side: CompareSide, type: 'open-csv' | 'open-folder') {
    if (!bridge) {
      setSide(side, (old) => ({
        ...old,
        error: 'ファイル選択を開始できませんでした。アプリを起動し直してください。',
      }));
      return;
    }
    const request = ++sequence.current;
    loads.current.set(request, side);
    setSide(side, (old) => ({
      ...old,
      busy: true,
      error: '',
      progress:
        type === 'open-folder' ? 'フォルダーを選択しています…' : 'ファイルを選択しています…',
    }));
    try {
      bridge.postMessage({ type, token: request });
    } catch (error) {
      loads.current.delete(request);
      setSide(side, (old) => ({ ...old, busy: false, progress: '', error: String(error) }));
    }
  }
  async function drop(side: CompareSide, transfer: DataTransfer) {
    setDragSide(null);
    if (busy) return;
    try {
      if (bridge?.postMessageWithAdditionalObjects) {
        const request = ++sequence.current;
        loads.current.set(request, side);
        setSide(side, (old) => ({
          ...old,
          busy: true,
          error: '',
          progress: 'ファイルを読み込んでいます…',
        }));
        bridge.postMessageWithAdditionalObjects(
          { type: 'read-dropped', token: request },
          Array.from(transfer.files),
        );
        return;
      }
      submit(side, await droppedInputs(transfer));
    } catch (error) {
      setSide(side, (old) => ({ ...old, busy: false, progress: '', error: String(error) }));
    }
  }
  const context = (event: MouseEvent, selection: DirectSelection) => {
    event.preventDefault();
    event.stopPropagation();
    setSelected(selection);
    if (bridge) {
      bridge.postMessage({
        type: 'instruction-menu',
        text: selection.instruction.copyText,
        commentList: commentListRequest(
          commentLists?.[selection.side],
          selection.instruction.operands,
          dark,
        ),
      });
      return;
    }
    setMenu({
      x: Math.min(event.clientX, window.innerWidth - 150),
      y: Math.min(event.clientY, window.innerHeight - 70),
      selection,
    });
  };
  const choose = (selection: DirectSelection) => {
    setSelected(selection);
    setMenu(null);
  };
  const navigateTo = (id: string, side: CompareSide) => {
    revealScript(id, side);
    setNavigation({ id, side, request: ++sequence.current });
  };
  const sides = { source, target },
    count = blocks.reduce((sum, b) => sum + b.changes.length, 0);
  const instruction = selected?.instruction;
  const status = (side: SideInput) =>
    side.busy ? 'loading' : side.error ? 'error' : side.batch ? 'ready' : 'empty';
  return (
    <div
      data-drag-side={dragSide ?? ''}
      data-source-status={status(source)}
      data-target-status={status(target)}
      class="app direct-comparison-app"
      onPointerDown={() => {
        if (menu) setMenu(null);
      }}
    >
      <ViewerHeader
        onComments={
          commentLists
            ? () =>
                openCommentList(
                  commentListRequest(
                    commentLists[selected?.side ?? 'source'],
                    selected?.instruction.operands,
                    dark,
                  )!,
                )
            : undefined
        }
        programNames={[]}
        currentName=""
        busy={busy}
        dark={dark}
        onChoose={() => {}}
        onToggleTheme={toggleTheme}
        onAbout={() => bridge?.postMessage({ type: 'show-about', dark })}
        onOpenFiles={() => {}}
        onOpenFolder={() => {}}
        hideOpenButtons
        onCompare={back}
        comparisonMode
      />
      <div class="subbar">
        <SearchBar
          query={query}
          mode={searchMode}
          results={headings}
          current={current}
          onQuery={setQuery}
          onMode={setSearchMode}
          onMove={(direction) => navigate((current + direction + matches.length) % matches.length)}
          onClear={() => setQuery('')}
        />
        <div>
          {pairs.length > 1 && (
            <label>
              プログラム
              <select
                aria-label="比較するプログラム"
                disabled={!listedPairs.length}
                value={pair?.id ?? ''}
                onChange={(e) => setPairId(e.currentTarget.value)}
              >
                {listedPairs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                    {p.error
                      ? '（比較不可）'
                      : !p.source
                        ? '（先のみ）'
                        : !p.target
                          ? '（元のみ）'
                          : overview[p.id] === true
                            ? '（差分なし）'
                            : overview[p.id] === false
                              ? '（差分あり）'
                              : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label class="comment-toggle">
            <input
              type="checkbox"
              aria-label="差分なしも表示"
              checked={showUnchanged}
              disabled={indexing}
              onChange={(e) => setShowUnchanged(e.currentTarget.checked)}
            />
            差分なしも表示
          </label>
          <label class="view-mode">
            表示
            <select
              aria-label="比較の表示"
              value={display}
              onChange={(e) => setDisplay(e.currentTarget.value as typeof display)}
            >
              <option value="both">左右比較</option>
              <option value="source">比較元のみ</option>
              <option value="target">比較先のみ</option>
            </select>
          </label>
          <label class="comment-toggle">
            <input
              type="checkbox"
              checked={comments}
              onChange={(e) => setComments(e.currentTarget.checked)}
            />
            コメント
          </label>
          {result?.format === 'keyence' &&
            ([result.comparison.source, result.comparison.target].some(
              (p) => keyenceScriptRegions(p).length > 0,
            ) ||
              [
                ...result.comparison.source.instructions,
                ...result.comparison.target.instructions,
              ].some((i) => i.st)) && <StColorToggle />}
          <label class="ladder-palette">
            ラダー配色
            <select
              aria-label="ラダー配色"
              value={palette}
              onChange={(e) => changePalette(e.currentTarget.value)}
            >
              {[
                { value: 'standard', label: '標準' },
                { value: 'contrast', label: '高コントラスト' },
                { value: 'soft', label: '目にやさしい' },
                { value: 'cud', label: '色覚配慮（CUD）' },
                { value: 'blue', label: 'ブルー' },
              ].map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label class="view-mode">
            長い回路
            <select
              aria-label="長い回路の表示"
              value={viewMode}
              onChange={(e) => setViewMode(e.currentTarget.value as typeof viewMode)}
            >
              <option value="wrap">折り返し</option>
              <option value="scroll">横スクロール</option>
            </select>
          </label>
          <button onClick={fit}>幅に合わせる</button>
          <button
            aria-label="縮小"
            onClick={() =>
              setZoom((z) => Math.max(display === 'both' ? 0.25 : 0.5, +(z - 0.1).toFixed(2)))
            }
          >
            −
          </button>
          <button onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
          <button
            aria-label="拡大"
            onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(2)))}
          >
            ＋
          </button>
        </div>
      </div>
      <div class="direct-inputs">
        {(['source', 'target'] as const).map((side) => (
          <section
            key={side}
            data-side={side}
            class="direct-input"
            onDragOver={(e) => {
              e.preventDefault();
              setDragSide(side);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragSide(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (e.dataTransfer) void drop(side, e.dataTransfer);
            }}
          >
            <strong>{side === 'source' ? '比較元' : '比較先'}</strong>
            <button
              disabled={busy}
              aria-label={`${side === 'source' ? '比較元' : '比較先'} ファイルを開く`}
              onClick={() => open(side, 'open-csv')}
            >
              ファイルを開く
            </button>
            <button
              disabled={busy}
              aria-label={`${side === 'source' ? '比較元' : '比較先'} フォルダーを開く`}
              onClick={() => open(side, 'open-folder')}
            >
              フォルダーを開く
            </button>
            <span>
              {sides[side].busy
                ? sides[side].progress
                : inputs[side].length
                  ? `✓ 読込み済み ${inputs[side].length}プログラム`
                  : 'CSV/MNM・フォルダーをドロップ'}
            </span>
            {sides[side].error && (
              <div class="error" role="alert">
                {sides[side].error}
              </div>
            )}
          </section>
        ))}
      </div>
      {compareError && (
        <div class="error" role="alert">
          {compareError}
        </div>
      )}
      <div class="workspace comparison-workspace">
        <div ref={width} class="comparison-host">
          {result ? (
            <DirectComparisonView
              key={pair?.id}
              blocks={blocks}
              zoom={zoom}
              display={display}
              sourceName={pair?.source?.name ?? '（なし）'}
              targetName={pair?.target?.name ?? '（なし）'}
              selected={selected}
              choose={choose}
              context={context}
              navigation={navigation}
              navigate={navigateTo}
              drop={(side, transfer) => {
                void drop(side, transfer);
              }}
              drag={setDragSide}
            />
          ) : (
            <div class="compare-columns direct-empty">
              {(['source', 'target'] as const).map((side) => (
                <section
                  key={side}
                  data-side={side}
                  class="direct-dropzone direct-pane"
                  aria-label={`${side === 'source' ? '比較元' : '比較先'} 読込み領域`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragSide(side);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null))
                      setDragSide(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.dataTransfer) void drop(side, e.dataTransfer);
                  }}
                >
                  <strong>{side === 'source' ? '比較元' : '比較先'}</strong>
                  <p>
                    {!showUnchanged && !listedPairs.length && source.batch && target.batch
                      ? '差分のあるプログラムはありません。'
                      : comparing
                        ? '比較しています…'
                        : inputs[side].length
                          ? '読み込み済み。もう片方を読み込むと比較します。'
                          : 'CSV/MNMまたはフォルダーを読み込んでください。'}
                  </p>
                </section>
              ))}
            </div>
          )}
        </div>
        <aside class="details">
          <div class="panel-title">命令の詳細</div>
          {instruction && selected ? (
            <div class="detail-content">
              <div class="eyebrow">
                {selected.side === 'source' ? '比較元' : '比較先'} · {instruction.line}
              </div>
              <h2>{instruction.op}</h2>
              <dl>
                {instruction.difference && (
                  <>
                    <dt>{differenceLabels[instruction.difference.kind]}</dt>
                    <dd>{instruction.difference.otherText || '（相手側なし）'}</dd>
                  </>
                )}
                {!!instruction.operands.length && (
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
                {instruction.comment && (
                  <>
                    <dt>コメント</dt>
                    <dd>{instruction.comment}</dd>
                  </>
                )}
                {instruction.controlFlow && (
                  <>
                    <dt>制御</dt>
                    <dd>
                      {instruction.controlFlow.label}
                      {instruction.controlFlow.targetStep !== undefined && (
                        <>
                          <br />
                          {instruction.controlFlow.targetId ? (
                            <button
                              class="step-link"
                              onClick={() =>
                                navigateTo(instruction.controlFlow!.targetId!, selected.side)
                              }
                            >
                              STEP {instruction.controlFlow.targetStep || '—'}
                            </button>
                          ) : (
                            <>対応STEP {instruction.controlFlow.targetStep}</>
                          )}
                        </>
                      )}
                    </dd>
                  </>
                )}
                <dt>元ファイル</dt>
                <dd>{selected.side === 'source' ? pair?.source?.name : pair?.target?.name}</dd>
              </dl>
            </div>
          ) : (
            <div class="detail-placeholder">命令を選択してください。</div>
          )}
        </aside>
      </div>
      <footer>
        <span class="status-dot" />
        {busy
          ? 'ファイルを読み込んでいます…'
          : indexing
            ? 'プログラム一覧を照合中…'
            : !showUnchanged && !listedPairs.length && source.batch && target.batch
              ? '差分のあるプログラムはありません。'
              : comparing
                ? '比較中'
                : result
                  ? `比較元 ${inputs.source.length} / 比較先 ${inputs.target.length}プログラム · 相違 ${count}行`
                  : '比較元と比較先を読み込んでください。'}
      </footer>
      {menu && (
        <div
          class="kv-context-menu"
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            role="menuitem"
            onClick={() => {
              void navigator.clipboard
                .writeText(menu.selection.instruction.copyText)
                .catch(() => setCompareError('コピーできませんでした。'));
              setMenu(null);
            }}
          >
            コピー
          </button>
          <button
            role="menuitem"
            onClick={() => {
              const request = commentListRequest(
                commentLists?.[menu.selection.side],
                menu.selection.instruction.operands,
                dark,
              );
              if (request) openCommentList(request);
              setMenu(null);
            }}
          >
            コメントリスト
          </button>
        </div>
      )}
    </div>
  );
}
