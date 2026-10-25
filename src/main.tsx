import { render } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { differenceLabels, type Instruction, type Program } from './model';
import type { BatchResult, CsvInput } from './batch';
import { LADDER_WIDTH, ROW, networkSize, type LadderViewMode } from './layout';
import './style.css';
import { NetworkDrawing, drawingHeight } from './NetworkDrawing';
import { ComparisonView, type CompareSide } from './ComparisonView';
import { AddressText } from './AddressText';
import { deviceComment, type DeviceComments } from './comments';
import { nativeCsvBridge, decodeNativeCsvFiles, type NativeCsvSelection } from './nativeCsv';

const worker = new Worker(new URL('./parser.worker.ts', import.meta.url), { type: 'module' });
function App() {
  const [program, setProgram] = useState<Program | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [deviceComments, setDeviceComments] = useState<DeviceComments>({});
  const [showComments, setShowComments] = useState(true);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Instruction | null>(null);
  const [selectedSide,setSelectedSide]=useState<CompareSide>('source');
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
    setProgram(next); setSelected(null); setSelectedSide('source'); setActive(next.networks[0]?.id ?? '');
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
      setPrograms(result.programs); setDeviceComments(result.deviceComments); setError(failures.join('\n'));
      if(result.programs[0].comparison)setZoom(.5);
      showProgram(result.programs[0]);
    };
    worker.onerror = () => { setBusy(false); setProgress(''); setError('解析処理でエラーが発生しました。再読み込みしてください。'); };
    const onNativeCsv = (event: MessageEvent<NativeCsvSelection>) => {
      const message = event.data;
      if (message?.type !== 'csv-selection' || message.token !== token.current) return;
      if (message.status === 'cancelled') { setBusy(false); setProgress(''); return; }
      if (message.status === 'error') { setBusy(false); setProgress(''); setError(message.error || 'CSVを読み込めませんでした。'); return; }
      try {
        const inputs = decodeNativeCsvFiles(message.files);
        inputWarnings.current = message.warnings ?? [];
        submitFiles(inputs, message.token);
      } catch (error) {
        setBusy(false); setProgress(''); setError(error instanceof Error ? error.message : String(error));
      }
    };
    nativeCsv?.addEventListener('message', onNativeCsv);
    const observer = new ResizeObserver(() => {
      const element = scroll.current;
      if (element) setViewport({ top: element.scrollTop, height: element.clientHeight });
    });
    if (scroll.current) observer.observe(scroll.current);
    return () => { observer.disconnect(); nativeCsv?.removeEventListener('message', onNativeCsv); };
  }, []);
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
  const layouts = useMemo(() => {
    let top = 8;
    return (program?.comparison ? [] : program?.networks ?? []).map(n => { const dimensions = networkSize(n,rowHeight); const item = { n, top, height: drawingHeight(n,rowHeight,zoom,viewMode), width: dimensions.width * zoom }; top += item.height; return item; });
  }, [program, zoom, rowHeight, viewMode]);
  const comparison=program?.comparison;
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
  return <div class="app" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (e.dataTransfer?.files.length) void load(Array.from(e.dataTransfer.files)); }}>
    <header><div class="brand"><span class="mark">LD</span><div><strong>Ladder viewer</strong></div></div><div class="toolbar"><button onClick={() => openSelection('open-csv')} disabled={busy}>＋ CSVを開く</button><button class="primary" onClick={() => openSelection('open-folder')} disabled={busy}>フォルダーを開く</button></div></header>
    <div class="subbar"><div class="program-selection">{programs.length > 1 && <><label for="program-select">プログラム</label><select id="program-select" aria-label="プログラム" value={program?.name ?? ''} disabled={busy} onChange={e=>{const next=programs.find(p=>p.name===e.currentTarget.value);if(next)showProgram(next);}}>{programs.map(p=><option key={p.name} value={p.name}>{p.name}{p.comparison ? ` · ${p.comparison.sourceName}` : ''}</option>)}</select><span class="program-count">{programs.length}本</span></>}<span>{program ? <><b>{program.name}</b><span class="muted">　{comparison ? (comparison.differentRows ? `${comparison.differentRows}行相違` : '比較元・比較先 一致') : program.cpu}</span></> : ''}</span></div><div>{commentCount > 0 && <label class="comment-toggle"><input type="checkbox" checked={showComments} onChange={e=>setShowComments(e.currentTarget.checked)}/>コメント</label>}<label class="view-mode">長い回路<select aria-label="長い回路の表示" value={viewMode} onChange={e => changeViewMode(e.currentTarget.value as LadderViewMode)}><option value="wrap">折り返し</option><option value="scroll">横スクロール</option></select></label><button onClick={()=>setZoom(Math.max(comparison ? .25 : .5,Math.min(1.5,Math.floor(((comparison ? ((comparisonWidth.current?.clientWidth??1100)-170)/2 : scroll.current?.clientWidth??1100)-24)/LADDER_WIDTH*100)/100)))}>幅に合わせる</button><button aria-label="縮小" onClick={() => setZoom(z => Math.max(comparison ? .25 : .5, +(z - .1).toFixed(2)))}>−</button><button onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button><button aria-label="拡大" onClick={() => setZoom(z => Math.min(1.5, +(z + .1).toFixed(1)))}>＋</button></div></div>
    {error && <div class="error" role="alert">{error}</div>}
    <div class={`workspace ${comparison?'comparison-workspace':''}`}><div ref={comparisonWidth} class="comparison-host" hidden={!comparison}>{comparison && program && <ComparisonView key={program.name} program={program} viewMode={viewMode} zoom={zoom} rowHeight={rowHeight} selected={selected?.id??''} choose={(i,side)=>{setSelected(i);setSelectedSide(side);}} comments={deviceComments} showComments={showComments}/>}</div>{!comparison && <><aside class="navigation"><div class="panel-title">回路一覧 <span>{program?.networks.length ?? 0}</span></div><div class="nav-list" ref={navigation}>{program?.networks.map((n, index) => <button class={`nav-item ${active === n.id ? 'active' : ''}`} onClick={() => jump(n.id)} key={n.id}><span class="number">{String(index + 1).padStart(3, '0')}</span><div><strong>{n.title || `STEP ${n.step}`}</strong><small>{n.actions[0]?.instruction.op} {n.actions[0]?.instruction.operands.join(' ') || ''}{n.warnings.length ? ' ⚠' : ''}</small></div></button>)}</div></aside>
    <main ref={scroll} class="diagram" onScroll={e => setViewport({ top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight })} aria-label="ラダー表示">
      {busy && <div class="loading" role="status">{progress || 'CSVを解析しています…'}</div>}
      {!program && !busy ? <div class="empty"><span class="empty-mark">─┤ ├─</span><p>CSVをドロップするか、「CSVを開く」「フォルダーを開く」で選択してください。</p><button class="primary" onClick={() => openSelection('open-csv')}>CSVを開く</button></div> : <div style={{ height: total ? total.top + total.height + 8 : 0, minWidth: Math.max(0, ...layouts.map(l => l.width + 24)), position: 'relative' }}>{visible.map(l => <section key={l.n.id} class="network" style={{ position: 'absolute', top: l.top, left: 12, width: l.width }}><NetworkDrawing network={l.n} viewMode={viewMode} selected={selected?.id ?? ''} choose={setSelected} zoom={zoom} rowHeight={rowHeight} comments={deviceComments} showComments={showComments}/></section>)}</div>}
    </main></>}
    <aside class="details"><div class="panel-title">命令の詳細</div>{selected ? <div class="detail-content"><span class="eyebrow">{comparison ? `${selectedSide==='source'?'比較元':'比較先'} · ` : ''}STEP {selected.step || '—'}</span><h2>{selected.op}</h2><dl>{selected.difference && <><dt class={`difference-label diff-${selected.difference.kind}`}>{differenceLabels[selected.difference.kind]}</dt><dd>{selectedSide==='source'?'比較先':'比較元'}: {selected.difference.otherText || 'なし'}<br/>STEP {selected.difference.otherStep || '—'}</dd></>}<dt>オペランド</dt><dd>{selected.operands.length ? selected.operands.map((o, index) => <div class={`operand ${selected.difference?.operandChanges.includes(index)?'changed-operand':''}`}><span>{index + 1}</span><div><code><AddressText text={o}/></code>{deviceComment(o,deviceComments) && <div class="operand-comment">{deviceComment(o,deviceComments)}</div>}</div></div>) : 'なし'}</dd><dt>元ファイル</dt><dd>{selectedProgram?.name}<br/>{comparison && <>{selectedSide==='source'?comparison.sourceProject:comparison.targetProject}<br/></>}CSV {selected.sourceRow}行</dd><dt>ノート</dt><dd>{selected.note || 'CSVに記載なし'}</dd></dl></div> : <div class="detail-placeholder">命令を選択してください。</div>}</aside></div>
    <footer><span class="status-dot"/>{busy ? '解析中' : program ? `${programs.length}プログラム · ${comparison ? `元 ${program.instructions.length.toLocaleString()} / 先 ${comparison.target.instructions.length.toLocaleString()}` : program.instructions.length.toLocaleString()} 命令 · ${program.networks.length} 回路${commentCount ? ` · コメント ${commentCount.toLocaleString()}件` : ''}` : 'CSVを選択してください'}</footer>
  </div>;
}
render(<App/>, document.getElementById('app')!);
