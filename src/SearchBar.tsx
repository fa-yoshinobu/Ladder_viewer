export interface SearchBarProps {
 query:string;mode:'partial'|'exact';results:{heading:string}[];current:number;placeholder?:string;
 onQuery:(value:string)=>void;onMode:(mode:'partial'|'exact')=>void;onMove:(delta:number)=>void;onClear:()=>void;
}
export function SearchBar({query,mode,results,current,placeholder='デバイス・命令・コメント・STEP',onQuery,onMode,onMove,onClear}:SearchBarProps) {
 const hasQuery=query.normalize('NFKC').trim().length>0;
 const result=hasQuery&&current>=0?results[current]:undefined;
 const canMove=hasQuery&&results.length>0;
 return <div class="search-bar" role="search">
  <input class="search-query" type="search" aria-label="検索" title="Ctrl+Fで検索" placeholder={placeholder}
   value={query} onInput={event=>onQuery(event.currentTarget.value)}
   onKeyDown={event=>{
    if(event.isComposing)return;
    if(event.key==='Enter'){event.preventDefault();if(canMove)onMove(event.shiftKey?-1:1);}
    else if(event.key==='Escape'){event.preventDefault();onClear();}
   }}/>
  <select class="search-mode" aria-label="一致方法" value={mode} onChange={event=>onMode(event.currentTarget.value as 'partial'|'exact')}>
   <option value="partial">部分一致</option><option value="exact">完全一致</option>
  </select>
  <span class="search-count" aria-live="polite">{hasQuery?(result?current+1:0)+'/'+results.length:''}</span>
  <button type="button" aria-label="前の検索結果" disabled={!canMove} onClick={()=>onMove(-1)}>前へ</button>
  <button type="button" aria-label="次の検索結果" disabled={!canMove} onClick={()=>onMove(1)}>次へ</button>
  <button type="button" aria-label="検索をクリア" disabled={!query} onClick={onClear}>クリア</button>
  {result&&<span class="search-result" title={result.heading}>{result.heading}</span>}
 </div>;
}
