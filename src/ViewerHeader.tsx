import type {ComponentChildren} from 'preact';

const iconUrl=new URL('./icon.svg',import.meta.url).href;
interface Props {
 programNames:string[];currentName:string;description?:ComponentChildren;busy:boolean;dark:boolean;
 onCompare?:()=>void;comparisonMode?:boolean;hideOpenButtons?:boolean;
 onChoose:(name:string)=>void;onToggleTheme:()=>void;onAbout:()=>void;onOpenFiles:()=>void;onOpenFolder:()=>void;
}
export function ViewerHeader({programNames,currentName,description,busy,dark,onChoose,onToggleTheme,onAbout,onOpenFiles,onOpenFolder,onCompare,comparisonMode=false,hideOpenButtons=false}:Props) {
 return <header><div class="brand"><img class="brand-icon" src={iconUrl} alt=""/><div><strong>Ladder Viewer</strong></div></div><div class="program-selection">{programNames.length > 1 && <><label for="program-select">プログラム</label><select id="program-select" aria-label="プログラム" value={currentName} disabled={busy} onChange={e=>onChoose(e.currentTarget.value)}>{programNames.map(name=><option key={name} value={name}>{name}</option>)}</select><span class="program-count">{programNames.length}本</span></>}<span>{currentName ? <><b>{currentName}</b><span class="muted">　{description}</span></> : ''}</span></div><div class="toolbar"><button class="theme-toggle" aria-pressed={dark} onClick={onToggleTheme}>{dark ? <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1" stroke="currentColor" stroke-width="2"/></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" fill="currentColor"/></svg>}{dark ? 'ライトモード' : 'ダークモード'}</button><>{onCompare&&<button aria-pressed={comparisonMode} onClick={onCompare}>{comparisonMode?'通常表示':'比較モード'}</button>}</><button onClick={onAbout}>バージョン情報</button>{!hideOpenButtons&&<><button onClick={onOpenFiles} disabled={busy}>＋ ファイルを開く</button><button class="primary" onClick={onOpenFolder} disabled={busy}>フォルダーを開く</button></>}</div></header>;
}
