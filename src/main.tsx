import { render } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Instruction, Program } from './model';
import type { BatchResult, CsvInput } from './batch';
import { LADDER_WIDTH, ROW, networkSize } from './layout';
import './style.css';
import { Ladder } from './Ladder';
import { AddressText } from './AddressText';
import { deviceComment, type DeviceComments } from './comments';

const worker = new Worker(new URL('./parser.worker.ts', import.meta.url), { type: 'module' });
function App() {
  const [program, setProgram] = useState<Program | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [deviceComments, setDeviceComments] = useState<DeviceComments>({});
  const [showComments, setShowComments] = useState(true);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [sample, setSample] = useState('02_MBUS.csv');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Instruction | null>(null);
  const [active, setActive] = useState('');
  const [zoom, setZoom] = useState(1);
  const [viewport, setViewport] = useState({ top: 0, height: 800 });
  const [elapsed, setElapsed] = useState(0);
  const scroll = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const navigation = useRef<HTMLDivElement>(null);
  const token = useRef(0);
  const started = useRef(0);
  function showProgram(next: Program) {
    setProgram(next); setSelected(null); setActive(next.networks[0]?.id ?? '');
    setViewport({ top: 0, height: scroll.current?.clientHeight ?? 800 });
    scroll.current?.scrollTo(0, 0); navigation.current?.scrollTo(0, 0);
  }
  useEffect(() => {
    worker.onmessage = (e: MessageEvent<{ token: number; result?: BatchResult; progress?: string; error?: string }>) => {
      if (e.data.token !== token.current) return;
      if (e.data.progress) { setProgress(e.data.progress); return; }
      setBusy(false); setProgress(''); setElapsed(Math.round(performance.now() - started.current));
      if (e.data.error) { setError(e.data.error); return; }
      const result = e.data.result!;
      const failures = result.errors.map(item => `${item.name}: ${item.message}`);
      if (!result.programs.length) {
        setError(failures.join('\n') || 'プログラムCSVがありません。コメントCSVはプログラム切替の対象外です。');
        return;
      }
      setPrograms(result.programs); setDeviceComments(result.deviceComments); setError(failures.join('\n'));
      showProgram(result.programs[0]);
    };
    worker.onerror = () => { setBusy(false); setProgress(''); setError('解析処理でエラーが発生しました。再読み込みしてください。'); };
    const observer = new ResizeObserver(() => setViewport(v => ({ ...v, height: scroll.current?.clientHeight ?? 800 })));
    if (scroll.current) observer.observe(scroll.current);
    return () => observer.disconnect();
  }, []);
  async function load(files?: File[]) {
    const request = ++token.current;
    setBusy(true); setProgress('CSVを読み込んでいます…'); setError(''); started.current = performance.now();
    try {
      let inputs: CsvInput[];
      if (files) {
        const csvFiles = files.filter(file => /\.csv$/i.test(file.name));
        if (!csvFiles.length) throw new Error('CSVがありません。フォルダーは「フォルダーを開く」で選択してください。');
        inputs = await Promise.all(csvFiles.map(async file => ({
          name: file.webkitRelativePath ? file.webkitRelativePath.split('/').slice(1).join('/') || file.name : file.name,
          bytes: await file.arrayBuffer()
        })));
      } else {
        const response = await fetch('./' + encodeURIComponent(sample));
        if (!response.ok) throw new Error('サンプルCSVを読み込めませんでした。');
        inputs = [{ name: sample, bytes: await response.arrayBuffer() }];
      }
      if (request !== token.current) return;
      worker.postMessage({ files: inputs, token: request }, inputs.map(input => input.bytes));
    } catch (e) {
      if (request === token.current) { setBusy(false); setProgress(''); setError(e instanceof Error ? e.message : String(e)); }
    }
  }
  const commentCount = useMemo(()=>Object.keys(deviceComments).length,[deviceComments]);
  const rowHeight = showComments && commentCount ? 72 : ROW;
  const layouts = useMemo(() => {
    let top = 8;
    return (program?.networks ?? []).map(n => { const dimensions = networkSize(n,rowHeight); const item = { n, top, height: dimensions.height * zoom + (n.title ? n.title.split('\n').length * 18 * zoom : 0) + n.warnings.length * 25, width: dimensions.width * zoom }; top += item.height; return item; });
  }, [program, zoom, rowHeight]);
  const total = layouts.at(-1);
  const visible = layouts.filter(l => l.top + l.height > viewport.top - 400 && l.top < viewport.top + viewport.height + 400);
  function jump(id: string) { const l = layouts.find(l => l.n.id === id); if (l) { setViewport({top:l.top,height:scroll.current?.clientHeight ?? 800}); scroll.current?.scrollTo({ top: l.top }); setActive(id); } }
  return <div class="app" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (e.dataTransfer?.files.length) void load(Array.from(e.dataTransfer.files)); }}>
    <header><div class="brand"><span class="mark">LD</span><div><strong>Ladder viewer</strong><small>CSVから回路を読む / PROTOTYPE</small></div></div><div class="toolbar"><input ref={fileInput} type="file" accept=".csv" multiple aria-label="CSVファイル" hidden onChange={e => { if(e.currentTarget.files?.length) void load(Array.from(e.currentTarget.files)); e.currentTarget.value = ''; }}/><input ref={folderInput} type="file" multiple {...{webkitdirectory:true}} aria-label="CSVフォルダー" hidden onChange={e => { if(e.currentTarget.files?.length) void load(Array.from(e.currentTarget.files)); e.currentTarget.value = ''; }}/><select aria-label="サンプルCSV" value={sample} onChange={e=>setSample(e.currentTarget.value)} disabled={busy}><option>02_MBUS.csv</option><option>重量測定部.csv</option></select><button onClick={() => void load()} disabled={busy}>サンプルを開く</button><button onClick={() => fileInput.current?.click()} disabled={busy}>＋ CSVを開く</button><button class="primary" onClick={() => folderInput.current?.click()} disabled={busy}>フォルダーを開く</button></div></header>
    <div class="subbar"><div class="program-selection">{programs.length > 1 && <><label for="program-select">プログラム</label><select id="program-select" aria-label="プログラム" value={program?.name ?? ''} disabled={busy} onChange={e=>{const next=programs.find(p=>p.name===e.currentTarget.value);if(next)showProgram(next);}}>{programs.map(p=><option key={p.name} value={p.name}>{p.name}</option>)}</select><span class="program-count">{programs.length}本</span></>}<span>{program ? <><b>{program.name}</b><span class="muted">　{program.cpu}</span></> : 'ローカルCSVビューア'}</span></div><div>{commentCount > 0 && <label class="comment-toggle"><input type="checkbox" checked={showComments} onChange={e=>setShowComments(e.currentTarget.checked)}/>コメント</label>}<button onClick={()=>setZoom(Math.max(.5,Math.min(1.5,Math.floor(((scroll.current?.clientWidth??1100)-24)/LADDER_WIDTH*100)/100)))}>幅に合わせる</button><button aria-label="縮小" onClick={() => setZoom(z => Math.max(.5, +(z - .1).toFixed(1)))}>−</button><button onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button><button aria-label="拡大" onClick={() => setZoom(z => Math.min(1.5, +(z + .1).toFixed(1)))}>＋</button></div></div>
    {error && <div class="error" role="alert">{error}</div>}
    <div class="workspace"><aside class="navigation"><div class="panel-title">回路一覧 <span>{program?.networks.length ?? 0}</span></div><div class="nav-list" ref={navigation}>{program?.networks.map((n, index) => <button class={`nav-item ${active === n.id ? 'active' : ''}`} onClick={() => jump(n.id)} key={n.id}><span class="number">{String(index + 1).padStart(3, '0')}</span><div><strong>{n.title || `STEP ${n.step}`}</strong><small>{n.actions[0]?.instruction.op} {n.actions[0]?.instruction.operands.join(' ') || '条件ブロック'}{n.warnings.length ? ' ⚠' : ''}</small></div></button>)}</div></aside>
    <main ref={scroll} class="diagram" onScroll={e => setViewport({ top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight })} aria-label="ラダー表示">
      {busy && <div class="loading" role="status">{progress || 'CSVを解析しています…'}</div>}
      {!program && !busy ? <div class="empty"><span class="empty-mark">─┤ ├─</span><h1>CSVを、読めるラダーへ。</h1><p>CSVをドロップするか、「CSVを開く」「フォルダーを開く」で選択してください。</p><button class="primary" onClick={() => void load()}>{sample} を表示</button><small>PC内で処理します。ファイルは外部へ送信しません。</small></div> : <div style={{ height: total ? total.top + total.height + 8 : 0, minWidth: Math.max(0, ...layouts.map(l => l.width + 24)), position: 'relative' }}>{visible.map(l => <section key={l.n.id} class="network" style={{ position: 'absolute', top: l.top, left: 12, width: l.width }}>{l.n.title && <div class="network-statements" style={{width:l.width-8*zoom,fontSize:14*zoom}}>{l.n.title.split('\n').map((text,index)=><div key={index} class="network-title" title={text} style={{height:18*zoom,lineHeight:`${18*zoom-2}px`}}>{text}</div>)}</div>}{l.n.warnings.map(w => <div class="warning">⚠ {w}</div>)}<div style={{ width: l.width, height: networkSize(l.n,rowHeight).height * zoom }}><Ladder network={l.n} selected={selected?.id ?? ''} choose={setSelected} zoom={zoom} rowHeight={rowHeight} comments={deviceComments} showComments={showComments}/></div></section>)}</div>}
    </main>
    <aside class="details"><div class="panel-title">命令の詳細</div>{selected ? <div class="detail-content"><span class="eyebrow">STEP {selected.step || '—'}</span><h2>{selected.op}</h2><dl><dt>オペランド</dt><dd>{selected.operands.length ? selected.operands.map((o, index) => <div class="operand"><span>{index + 1}</span><div><code><AddressText text={o}/></code>{deviceComment(o,deviceComments) && <div class="operand-comment">{deviceComment(o,deviceComments)}</div>}</div></div>) : 'なし'}</dd><dt>元ファイル</dt><dd>{program?.name}<br/>CSV {selected.sourceRow}行</dd><dt>ノート</dt><dd>{selected.note || 'CSVに記載なし'}</dd></dl></div> : <div class="detail-placeholder">接点・命令を選択すると、全オペランドと元CSV行を表示します。</div>}</aside></div>
    <footer><span class="status-dot"/>{busy ? '解析中' : program ? `${programs.length}プログラム · ${program.instructions.length.toLocaleString()} 命令 · ${program.networks.length} 回路 · 読込 ${elapsed} ms${commentCount ? ` · コメント ${commentCount.toLocaleString()}件` : ''}` : 'CSVを選択してください'}<span class="footer-right">{program ? `描画 ${visible.length} / ${program.networks.length} 回路　│　` : ''}LOCAL / OFFLINE READY</span></footer>
  </div>;
}
render(<App/>, document.getElementById('app')!);
