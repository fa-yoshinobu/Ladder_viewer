import { render } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { differenceLabels, type Instruction, type Program } from './model';
import type { BatchResult, CsvInput } from './batch';
import { ROW, networkSize, fitLadderZoom, type LadderViewMode } from './layout';
import './style.css';
import { NetworkDrawing, drawingHeight, instructionDrawingOffset } from './NetworkDrawing';
import { SearchBar } from './SearchBar';
import { buildSearchIndex, searchInstructions, type SearchMode } from './search';
import { ComparisonView, type CompareSide } from './ComparisonView';
import { comparisonDisplayProgram, type ComparisonDisplay } from './comparisonDisplay';
import { AddressText } from './AddressText';
import { deviceComment, type DeviceComments } from './comments';
import { nativeCsvBridge, decodeNativeCsvFiles, type NativeCsvSelection } from './nativeCsv';

const worker = new Worker(new URL('./parser.worker.ts', import.meta.url), { type: 'module' });
const iconUrl = new URL('./icon.svg', import.meta.url).href;
type Theme = 'light' | 'dark';
function initialTheme(): Theme {
  try { const saved = localStorage.getItem('theme'); if (saved === 'light' || saved === 'dark') return saved; } catch {}
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
document.documentElement.dataset.theme = initialTheme();
const ladderPalettes = [
  { value: 'standard', label: '標準' },
  { value: 'contrast', label: '高コントラスト' },
  { value: 'soft', label: '目にやさしい' },
  { value: 'cud', label: '色覚配慮（CUD）' },
  { value: 'blue', label: 'ブルー' }
] as const;
type LadderPalette = typeof ladderPalettes[number]['value'];
// The ladder palette is remembered separately for light and dark mode.
function savedLadderPalette(theme: Theme): LadderPalette {
  try { const saved = localStorage.getItem(`ladderPalette-${theme}`); const match = ladderPalettes.find(p => p.value === saved); if (match) return match.value; } catch {}
  return 'standard';
}
document.documentElement.dataset.ladder = savedLadderPalette(document.documentElement.dataset.theme as Theme);
function App() {
  const [program, setProgram] = useState<Program | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [commentsByProgram, setCommentsByProgram] = useState<Record<string, DeviceComments>>({});
  const deviceComments = useMemo(() => commentsByProgram[program?.name ?? ''] ?? {}, [program, commentsByProgram]);
  const [showComments, setShowComments] = useState(true);
  const [theme, setTheme] = useState<Theme>(() => document.documentElement.dataset.theme as Theme);
  const [ladderPalette, setLadderPalette] = useState<LadderPalette>(() => document.documentElement.dataset.ladder as LadderPalette);
  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    const palette = savedLadderPalette(next);
    document.documentElement.dataset.theme = next; document.documentElement.dataset.ladder = palette;
    setTheme(next); setLadderPalette(palette);
    try { localStorage.setItem('theme', next); } catch {}
  }
  function changeLadderPalette(next: LadderPalette) {
    document.documentElement.dataset.ladder = next; setLadderPalette(next);
    try { localStorage.setItem(`ladderPalette-${theme}`, next); } catch {}
  }
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Instruction | null>(null);
  const [selectedSide,setSelectedSide]=useState<CompareSide>('source');
  const [comparisonDisplay,setComparisonDisplay]=useState<ComparisonDisplay>('both');
  const [searchQuery,setSearchQuery]=useState('');
  const [searchMode,setSearchMode]=useState<SearchMode>('partial');
  const [searchCurrent,setSearchCurrent]=useState(-1);
  const [comparisonNavigation,setComparisonNavigation]=useState<{instructionId:string;side:CompareSide;request:number}>();
  const jumpRequest=useRef(0);
  const pendingInstruction=useRef<{id:string;ownerId:string}|null>(null);
  const pendingFit=useRef(false);
  const comparisonWidth=useRef<HTMLDivElement>(null);
  const [active, setActive] = useState('');
  const [zoom, setZoom] = useState(1);
  const [viewMode, setViewMode] = useState<LadderViewMode>('wrap');
  const viewAnchor = useRef<string | null>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 800 });
  const scroll = useRef<HTMLDivElement>(null);
  const navigation = useRef<HTMLDivElement>(null);
  const token = useRef(0);
  const inputWarnings = useRef<string[]>([]);
  const nativeCsv = nativeCsvBridge();
  function showProgram(next: Program) {
    pendingFit.current=true;
    setComparisonNavigation(undefined);pendingInstruction.current=null;
    setProgram(next); setSelected(null); setSelectedSide('source'); setActive(next.networks[0]?.id ?? '');
    setComparisonDisplay('both'); setZoom(next.comparison ? .5 : 1); viewAnchor.current = null;
    const element = scroll.current;
    element?.scrollTo(0, 0);
    setViewport({ top: element?.scrollTop ?? 0, height: element?.clientHeight ?? 800 });
    navigation.current?.scrollTo(0, 0);
  }
  useEffect(() => {
    worker.onmessage = (e: MessageEvent<{ token: number; result?: BatchResult; progress?: string; error?: string }>) => {
      if (e.data.token !== token.current) return;
      if (e.data.progress) { setProgress(e.data.progress); return; }
      setBusy(false); setProgress('');
      if (e.data.error) { setError(e.data.error); return; }
      const result = e.data.result!;
      const failures = [...inputWarnings.current, ...result.errors.map(item => `${item.name}: ${item.message}`)];
      if (!result.programs.length) {
        setError(failures.join('\n') || 'プログラムCSVがありません。コメントCSVはプログラム切替の対象外です。');
        return;
      }
      setPrograms(result.programs); setCommentsByProgram(result.commentsByProgram); setError(failures.join('\n'));

      showProgram(result.programs[0]);
    };
    worker.onerror = () => { setBusy(false); setProgress(''); setError('解析処理でエラーが発生しました。再読み込みしてください。'); };
    const onNativeCsv = (event: MessageEvent<NativeCsvSelection>) => {
      const message = event.data;
      if (message?.type !== 'csv-selection' || message.token !== token.current) return;
      if (message.status === 'loading') { setBusy(true); setProgress('CSVを読み込んでいます…'); return; }
      if (message.status === 'cancelled') { setBusy(false); setProgress(''); return; }
      if (message.status === 'error') { setBusy(false); setProgress(''); setError(message.error || 'CSVを読み込めませんでした。'); return; }
      try {
        const inputs = decodeNativeCsvFiles(message.files);
        inputWarnings.current = message.warnings ?? [];
        setBusy(true); setProgress('CSVを読み込んでいます…');
        submitFiles(inputs, message.token);
      } catch (error) {
        setBusy(false); setProgress(''); setError(error instanceof Error ? error.message : String(error));
      }
    };
    nativeCsv?.addEventListener('message', onNativeCsv);
    try { nativeCsv?.postMessage({ type: 'open-startup', token: token.current }); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    return () => { nativeCsv?.removeEventListener('message', onNativeCsv); };
  }, []);
  useEffect(()=>{
    const find=(event:KeyboardEvent)=>{
      if(event.ctrlKey&&event.key.toLowerCase()==='f'){
        event.preventDefault();
        const field=document.querySelector<HTMLInputElement>('.search-query');
        field?.focus();field?.select();
      }
    };
    window.addEventListener('keydown',find);
    return()=>window.removeEventListener('keydown',find);
  },[]);
  function startLoad(progress = 'CSVを読み込んでいます…') {
    const request = ++token.current;
    inputWarnings.current = [];
    setBusy(true); setProgress(progress); setError('');
    return request;
  }
  function submitFiles(inputs: CsvInput[], request: number) {
    if (request !== token.current) return;
    worker.postMessage({ files: inputs, token: request }, inputs.map(input => input.bytes));
  }
  function openSelection(type: 'open-csv' | 'open-folder') {
    if (!nativeCsv) { setError('ファイル選択を開始できませんでした。アプリを起動し直してください。'); return; }
    const request = startLoad(type === 'open-folder' ? 'フォルダーを選択しています…' : 'CSVを選択しています…');
    try { nativeCsv.postMessage({ type, token: request }); }
    catch (error) { setBusy(false); setProgress(''); setError(error instanceof Error ? error.message : String(error)); }
  }
  async function load(files: File[]) {
    const request = startLoad();
    try {
      const csvFiles = files.filter(file => /\.csv$/i.test(file.name));
      if (!csvFiles.length) throw new Error('CSVがありません。フォルダーは「フォルダーを開く」で選択してください。');
      const inputs: CsvInput[] = await Promise.all(csvFiles.map(async file => ({
        name: file.webkitRelativePath ? file.webkitRelativePath.split('/').slice(1).join('/') || file.name : file.name,
        bytes: await file.arrayBuffer()
      })));
      submitFiles(inputs, request);
    } catch (e) {
      if (request === token.current) { setBusy(false); setProgress(''); setError(e instanceof Error ? e.message : String(e)); }
    }
  }
  const commentCount = useMemo(()=>Object.keys(deviceComments).length,[deviceComments]);
  const rowHeight = showComments && commentCount ? 72 : ROW;
  const comparison=program?.comparison;
  const showComparison=!!comparison&&comparisonDisplay==='both';
  const displayedProgram=useMemo(()=>program?comparisonDisplayProgram(program,comparisonDisplay):null,[program,comparisonDisplay]);
  const layouts = useMemo(() => {
    let top = 8;
    return (showComparison ? [] : displayedProgram?.networks ?? []).map(n => { const dimensions = networkSize(n,rowHeight); const item = { n, top, height: drawingHeight(n,rowHeight,zoom,viewMode), width: dimensions.width * zoom }; top += item.height; return item; });
  }, [displayedProgram, showComparison, zoom, rowHeight, viewMode]);
  const searchIndex=useMemo(()=>program?buildSearchIndex(program,deviceComments,comparisonDisplay):[],[program,deviceComments,comparisonDisplay]);
  const searchResults=useMemo(()=>searchInstructions(searchIndex,searchQuery,searchMode),[searchIndex,searchQuery,searchMode]);
  useEffect(()=>{
    setSearchCurrent(searchResults.length?0:-1);
    const hit=searchResults[0];
    if(hit)navigateInstruction(hit.instruction.id,hit.side);
  },[searchResults]);
  useLayoutEffect(()=>{
    const pending=pendingInstruction.current,element=scroll.current;
    if(!pending||!element||showComparison)return;
    pendingInstruction.current=null;
    const target=element.querySelector(`[data-instruction-id="${CSS.escape(pending.id)}"]`)??element.querySelector(`[data-instruction-id="${CSS.escape(pending.ownerId)}"]`);
    target?.scrollIntoView({block:'nearest',inline:'nearest'});
    setViewport({top:element.scrollTop,height:element.clientHeight});
  });
  const selectedProgram=selectedSide==='target'&&comparison?comparison.target:program;
  const total = layouts.at(-1);
  const visible = layouts.filter(l => l.top + l.height > viewport.top - 400 && l.top < viewport.top + viewport.height + 400);
  useLayoutEffect(() => {
    const anchor = viewAnchor.current;
    viewAnchor.current = null;
    const layout = layouts.find(item => item.n.id === anchor);
    const element = scroll.current;
    if (layout) {
      element?.scrollTo({ top: layout.top });
      setActive(layout.n.id);
    }
    if (element) setViewport({ top: element.scrollTop, height: element.clientHeight });
  }, [layouts]);
  useLayoutEffect(() => {
    const element=scroll.current;
    if(!element)return;
    const observer=new ResizeObserver(()=>setViewport({top:element.scrollTop,height:element.clientHeight}));
    observer.observe(element);
    return()=>observer.disconnect();
  }, [showComparison]);
  function fitToWidth() {
    if(!program)return false;
    const element=showComparison?comparisonWidth.current:scroll.current;
    if(!element||element.clientWidth<=0)return false;
    setZoom(fitLadderZoom(element.clientWidth,showComparison));
    return true;
  }
  useLayoutEffect(()=>{
    if(!program||!pendingFit.current)return;
    const element=showComparison?comparisonWidth.current:scroll.current;
    if(!element)return;
    let observer:ResizeObserver|undefined;
    const fit=()=>{
      if(!pendingFit.current){observer?.disconnect();return;}
      if(!fitToWidth())return;
      pendingFit.current=false;
      observer?.disconnect();
    };
    fit();
    if(!pendingFit.current)return;
    observer=new ResizeObserver(fit);
    observer.observe(element);
    return()=>observer?.disconnect();
  },[program,showComparison,comparisonDisplay]);
  // Refit whenever the ladder area changes width (window resize). offsetWidth ignores scrollbars that appear after a fit.
  useLayoutEffect(()=>{
    const element=showComparison?comparisonWidth.current:scroll.current;
    if(!program||!element)return;
    let width=element.offsetWidth;
    const observer=new ResizeObserver(()=>{
      if(element.offsetWidth===width)return;
      width=element.offsetWidth;
      fitToWidth();
    });
    observer.observe(element);
    return()=>observer.disconnect();
  },[program,showComparison]);
  function changeComparisonDisplay(next:ComparisonDisplay) {
    setComparisonNavigation(undefined);pendingInstruction.current=null;
    if(!program||!comparison||next===comparisonDisplay)return;
    const side=next==='target'?comparison.target:program;
    setComparisonDisplay(next);setSelected(null);setSelectedSide(next==='target'?'target':'source');
    setActive(side.networks[0]?.id??'');setZoom(next==='both'?.5:1);viewAnchor.current=null;pendingFit.current=true;
    const element=scroll.current;
    element?.scrollTo(0,0);
    setViewport({top:element?.scrollTop??0,height:element?.clientHeight??viewport.height});
    navigation.current?.scrollTo(0,0);
  }
  function chooseDisplayedInstruction(instruction:Instruction) {
    setSelected(instruction);setSelectedSide(comparison&&comparisonDisplay==='target'?'target':'source');
  }
  function changeViewMode(next: LadderViewMode) {
    if (next === viewMode) return;
    const top = scroll.current?.scrollTop ?? viewport.top;
    const selectedLayout = layouts.find(item => item.n.instructions.some(i => i.id === selected?.id));
    const current = selectedLayout && selectedLayout.top < top + viewport.height && selectedLayout.top + selectedLayout.height > top
      ? selectedLayout : layouts.find(item => item.top + item.height > top);
    viewAnchor.current = current?.n.id ?? null;
    setViewMode(next);
  }
  function jump(id: string) {
    const layout = layouts.find(item => item.n.id === id), element = scroll.current;
    if (layout && element) {
      element.scrollTo({ top: layout.top });
      setViewport({ top: element.scrollTop, height: element.clientHeight });
      setActive(id);
    }
  }
  function navigateInstruction(instructionId:string,side:CompareSide) {
    const original=side==='target'&&comparison?comparison.target:program;
    const instruction=original?.instructions.find(i=>i.id===instructionId);
    if(!instruction)return;
    if(showComparison){
      setComparisonNavigation({instructionId,side,request:++jumpRequest.current});
      return;
    }
    const layout=layouts.find(item=>item.n.instructions.some(i=>i.id===instructionId)||item.n.pointer?.id===instructionId);
    const element=scroll.current;
    if(!layout||!element)return;
    const owner=layout.n.actions.find(action=>action.instruction.pins?.some(pin=>pin.id===instructionId))?.instruction;
    pendingInstruction.current={id:instructionId,ownerId:owner?.id??instructionId};
    element.scrollTo({top:layout.top+instructionDrawingOffset(layout.n,instructionId,rowHeight,zoom,viewMode)});
    setViewport({top:element.scrollTop,height:element.clientHeight});setActive(layout.n.id);
    setSelected(instruction);setSelectedSide(side);
    navigation.current?.querySelector(`[data-network-id="${CSS.escape(layout.n.id)}"]`)?.scrollIntoView({block:'nearest'});
  }
  function moveSearch(delta:number) {
    if(!searchResults.length)return;
    const next=searchCurrent<0?(delta<0?searchResults.length-1:0):(searchCurrent+delta+searchResults.length)%searchResults.length;
    setSearchCurrent(next);
    const hit=searchResults[next];navigateInstruction(hit.instruction.id,hit.side);
  }
  return <div class="app" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (e.dataTransfer?.files.length) void load(Array.from(e.dataTransfer.files)); }}>
    <header><div class="brand"><img class="brand-icon" src={iconUrl} alt=""/><div><strong>Ladder Viewer</strong></div></div><div class="program-selection">{programs.length > 1 && <><label for="program-select">プログラム</label><select id="program-select" aria-label="プログラム" value={program?.name ?? ''} disabled={busy} onChange={e=>{const next=programs.find(p=>p.name===e.currentTarget.value);if(next)showProgram(next);}}>{programs.map(p=><option key={p.name} value={p.name}>{p.name}{p.comparison ? ` · ${p.comparison.sourceName}` : ''}</option>)}</select><span class="program-count">{programs.length}本</span></>}<span>{program ? <><b>{program.name}</b><span class="muted">　{comparison ? (comparison.differentRows ? `${comparison.differentRows}行相違` : '比較元・比較先 一致') : program.cpu}</span></> : ''}</span></div><div class="toolbar"><button class="theme-toggle" aria-pressed={theme === 'dark'} onClick={toggleTheme}>{theme === 'dark' ? <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1" stroke="currentColor" stroke-width="2"/></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" fill="currentColor"/></svg>}{theme === 'dark' ? 'ライトモード' : 'ダークモード'}</button><button onClick={() => nativeCsv?.postMessage({ type: 'show-about', dark: theme === 'dark' })}>バージョン情報</button><button onClick={() => openSelection('open-csv')} disabled={busy}>＋ CSVを開く</button><button class="primary" onClick={() => openSelection('open-folder')} disabled={busy}>フォルダーを開く</button></div></header>
    <div class="subbar">{program&&<SearchBar comparison={!!comparison} query={searchQuery} mode={searchMode} results={searchResults} current={searchCurrent} onQuery={setSearchQuery} onMode={setSearchMode} onMove={moveSearch} onClear={()=>setSearchQuery('')}/>}<div>{comparison && <label class="view-mode">表示<select aria-label="比較の表示" value={comparisonDisplay} disabled={busy} onChange={e=>changeComparisonDisplay(e.currentTarget.value as ComparisonDisplay)}><option value="both">左右比較</option><option value="source">比較元のみ</option><option value="target">比較先のみ</option></select></label>}{commentCount > 0 && <label class="comment-toggle"><input type="checkbox" checked={showComments} onChange={e=>setShowComments(e.currentTarget.checked)}/>コメント</label>}<label class="ladder-palette">ラダー配色<select aria-label={`ラダー配色（${theme === 'dark' ? 'ダーク' : 'ライト'}モード）`} title={`${theme === 'dark' ? 'ダーク' : 'ライト'}モード用の配色`} value={ladderPalette} onChange={e => changeLadderPalette(e.currentTarget.value as LadderPalette)}>{ladderPalettes.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select></label><label class="view-mode">長い回路<select aria-label="長い回路の表示" value={viewMode} onChange={e => changeViewMode(e.currentTarget.value as LadderViewMode)}><option value="wrap">折り返し</option><option value="scroll">横スクロール</option></select></label><button onClick={fitToWidth}>幅に合わせる</button><button aria-label="縮小" onClick={() => setZoom(z => Math.max(showComparison ? .25 : .5, +(z - .1).toFixed(2)))}>−</button><button onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button><button aria-label="拡大" onClick={() => setZoom(z => Math.min(1.5, +(z + .1).toFixed(1)))}>＋</button></div></div>
    {error && <div class="error" role="alert">{error}</div>}
    <div class={`workspace ${showComparison?'comparison-workspace':''}`}><div ref={comparisonWidth} class="comparison-host" hidden={!showComparison}>{showComparison && program && <ComparisonView key={program.name} program={program} navigationTarget={comparisonNavigation} viewMode={viewMode} zoom={zoom} rowHeight={rowHeight} selected={selected?.id??''} choose={(i,side)=>{setSelected(i);setSelectedSide(side);}} comments={deviceComments} showComments={showComments}/>}</div>{!showComparison && <><aside class="navigation"><div class="panel-title">回路一覧 <span>{displayedProgram?.networks.length ?? 0}</span></div><div class="nav-list" ref={navigation}>{displayedProgram?.networks.map((n, index) => <button class={`nav-item ${active === n.id ? 'active' : ''}`} onClick={() => jump(n.id)} key={n.id} data-network-id={n.id}><span class="number">{String(index + 1).padStart(3, '0')}</span><div><strong>{n.title || `STEP ${n.step}`}</strong><small>{n.actions[0]?.instruction.op} {n.actions[0]?.instruction.operands.join(' ') || ''}{n.warnings.length ? ' ⚠' : ''}</small></div></button>)}</div></aside>
    <main ref={scroll} class="diagram" onScroll={e => setViewport({ top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight })} aria-label="ラダー表示">
      {busy && <div class="loading" role="status">{progress || 'CSVを解析しています…'}</div>}
      {!program && !busy ? <div class="empty"><span class="empty-mark">─┤ ├─</span><p>CSVをドロップするか、「CSVを開く」「フォルダーを開く」で選択してください。</p><button class="primary" onClick={() => openSelection('open-csv')}>CSVを開く</button></div> : comparison && displayedProgram?.networks.length===0 ? <div class="empty">この側に回路はありません。</div> : <div style={{ height: total ? total.top + total.height + 8 : 0, minWidth: Math.max(0, ...layouts.map(l => l.width + 24)), position: 'relative' }}>{visible.map(l => <section key={l.n.id} data-network-id={l.n.id} class="network" style={{ position: 'absolute', top: l.top, left: 12, width: l.width }}><NetworkDrawing network={l.n} viewMode={viewMode} selected={selected?.id ?? ''} choose={chooseDisplayedInstruction} navigate={id=>navigateInstruction(id,comparisonDisplay==='target'?'target':'source')} zoom={zoom} rowHeight={rowHeight} comments={deviceComments} showComments={showComments}/></section>)}</div>}
    </main></>}
    <aside class="details"><div class="panel-title">命令の詳細</div>{selected ? <div class="detail-content"><span class="eyebrow">{comparison ? `${selectedSide==='source'?'比較元':'比較先'} · ` : ''}STEP {selected.step || '—'}</span><h2>{selected.op}</h2><dl>{selected.difference && <><dt class={`difference-label diff-${selected.difference.kind}`}>{differenceLabels[selected.difference.kind]}</dt><dd>{selectedSide==='source'?'比較先':'比較元'}: {selected.difference.otherText || 'なし'}<br/>STEP {selected.difference.otherStep || '—'}</dd></>}{selected.controlFlow && <><dt>制御</dt><dd>{selected.controlFlow.label}{selected.controlFlow.targetStep!==undefined && <><br/>{selected.controlFlow.targetId?<button type="button" class="step-link" onClick={()=>navigateInstruction(selected.controlFlow!.targetId!,selectedSide)}>STEP {selected.controlFlow.targetStep||'—'}</button>:<>対応STEP {selected.controlFlow.targetStep}</>}</>}</dd></>}<dt>オペランド</dt><dd>{selected.operands.length ? selected.operands.map((o, index) => <div class={`operand ${selected.difference?.operandChanges.includes(index)?'changed-operand':''}`}><span>{index + 1}</span><div><code><AddressText text={o}/></code>{deviceComment(o,deviceComments) && <div class="operand-comment">{deviceComment(o,deviceComments)}</div>}</div></div>) : 'なし'}</dd>{selected.inlineST&&<><dt>インラインST</dt><dd><pre class="detail-st-code">{selected.inlineST.text}</pre></dd></>}<dt>元ファイル</dt><dd>{selectedProgram?.name}<br/>{comparison && <>{selectedSide==='source'?comparison.sourceProject:comparison.targetProject}<br/></>}CSV {selected.sourceRow}行</dd></dl></div> : <div class="detail-placeholder">命令を選択してください。</div>}</aside></div>
    <footer><span class="status-dot"/>{busy ? '解析中' : displayedProgram ? `${programs.length}プログラム · ${showComparison && comparison ? `元 ${displayedProgram.instructions.length.toLocaleString()} / 先 ${comparison.target.instructions.length.toLocaleString()}` : displayedProgram.instructions.length.toLocaleString()} 命令 · ${displayedProgram.networks.length} 回路${commentCount ? ` · コメント ${commentCount.toLocaleString()}件` : ''}` : 'CSVを選択してください'}</footer>
  </div>;
}
render(<App/>, document.getElementById('app')!);
