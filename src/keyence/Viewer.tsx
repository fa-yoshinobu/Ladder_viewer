import {normalizeSearchText as normalize,searchTextMatches} from '../searchText';
import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'preact/hooks';
import type {KeyenceInstruction,KeyenceProgram} from './model';
import {nativeCsvBridge} from '../nativeCsv';
import {buildKeyenceNetworks} from './logic';
import {keyenceInstructionComment,layoutKeyenceNetwork,keyenceViewDrawing,keyenceSymbolOwns} from './layout';
import {LADDER_WIDTH,SCROLLBAR_HEIGHT} from '../ladderMetrics';
import {HorizontalScroll} from '../HorizontalScroll';
import {KeyenceLadder} from './Ladder';
import {SearchBar} from '../SearchBar';
import {ViewerHeader} from '../ViewerHeader';
import {keyenceInstructionCopyText} from './instructionCopy';
import {keyenceDeviceComment} from './comments';

interface Props {
 program:KeyenceProgram;names:string[];busy:boolean;progress:string;error:string;dark:boolean;
 palette:string;changePalette:(value:string)=>void;
 onCompare?:()=>void;choose:(name:string)=>void;openFiles:()=>void;openFolder:()=>void;toggleTheme:()=>void;drop:(files:File[])=>void;
}
const clampZoom=(value:number)=>Math.min(1.5,Math.max(.5,value));
export function KeyenceViewer({program,names,busy,progress,error,dark,palette,changePalette,choose,openFiles,openFolder,toggleTheme,drop,onCompare}:Props) {
 const viewport=useRef<HTMLDivElement>(null),viewAnchor=useRef<number|null>(null);
 const [showComments,setShowComments]=useState(true),[zoom,setZoom]=useState(1);
 const [size,setSize]=useState({width:1000,height:800}),[scrollTop,setScrollTop]=useState(0);
 const [selected,setSelected]=useState(''),[selectedNetwork,setSelectedNetwork]=useState('');
 const [query,setQuery]=useState(''),[searchIndex,setSearchIndex]=useState(-1);
 const [viewMode,setViewMode]=useState<'wrap'|'scroll'>('wrap');
 const [searchMode,setSearchMode]=useState<'partial'|'exact'>('partial');
 const [pendingTarget,setPendingTarget]=useState<KeyenceInstruction|null>(null);
 const [menu,setMenu]=useState<{x:number;y:number;instruction:KeyenceInstruction}|null>(null),[copyError,setCopyError]=useState('');
 const networks=useMemo(()=>buildKeyenceNetworks(program),[program]);
 const hasComments=useMemo(()=>Object.keys(program.deviceComments).length>0||program.instructions.some(instruction=>!!instruction.comment||!!instruction.fb?.pins.some(pin=>pin.comment||pin.description)),[program]);
 const baseDrawings=useMemo(()=>networks.map(network=>layoutKeyenceNetwork(network,program,showComments)),[networks,program,showComments]);
 const drawings=useMemo(()=>baseDrawings.map(drawing=>keyenceViewDrawing(drawing,viewMode)),[baseDrawings,viewMode]);
 const scrolling=useMemo(()=>drawings.map(drawing=>viewMode==='scroll'&&drawing.width>LADDER_WIDTH),[drawings,viewMode]);
 const dimensions=useMemo(()=>{
  let total=8;const offsets:number[]=[],heights:number[]=[];
  for(const [index,drawing] of drawings.entries()){
   offsets.push(total);
   const height=Math.ceil(drawing.height*zoom)+(scrolling[index]?SCROLLBAR_HEIGHT:0);
   heights.push(height);total+=height;
  }
  return {offsets,heights,total:total+8};
 },[drawings,zoom,scrolling]);
 const visible=useMemo(()=>{
  // Binary search keeps navigation near the end from leaving blank areas.
  const {offsets,heights}=dimensions;let low=0,high=offsets.length;
  const start=Math.max(0,scrollTop-size.height),end=scrollTop+size.height*2;
  while(low<high){const mid=(low+high)>>>1;if(offsets[mid]+heights[mid]<start)low=mid+1;else high=mid;}
  const indices:number[]=[];
  for(let index=low;index<offsets.length&&offsets[index]<end;index++)indices.push(index);
  return indices;
 },[dimensions,scrollTop,size.height]);
 const instruction=useMemo(()=>program.instructions.find(item=>item.id===selected),[program,selected]);
 const instructionNetworks=useMemo(()=>new Map(networks.flatMap((network,index)=>network.instructions.map(item=>[item.id,index] as const))),[networks]);
 const searchEntries=useMemo(()=>{

  return program.instructions.map(item=>({item,fields:[item.opcode,...item.operands,[item.opcode,...item.operands].join(' '),
   keyenceInstructionCopyText(item,program),String(item.sourceLine),`元ファイル ${item.sourceLine}行`,`行 ${item.sourceLine}`,item.comment,item.statement,
   keyenceInstructionComment(item,program),...item.operands.map(address=>keyenceDeviceComment(address,program.deviceComments))].map(normalize).filter(Boolean)}));
 },[program]);
 const matches=useMemo(()=>{
  const needle=normalize(query);
  return searchEntries.filter(entry=>searchTextMatches(entry.fields,needle,searchMode)).map(entry=>entry.item);
 },[searchEntries,query,searchMode]);
 const searchResults=useMemo(()=>matches.map(item=>({heading:`元ファイル ${item.sourceLine}行 · ${[item.opcode,...item.operands].join(' ')}`})),[matches]);
 const fit=()=>{const width=viewport.current?.clientWidth??size.width;setZoom(clampZoom(Math.floor((width-24)/LADDER_WIDTH*100)/100));};
 useEffect(()=>{
  setSelected(program.instructions[0]?.id??'');setSelectedNetwork(networks[0]?.id??'');setScrollTop(0);setMenu(null);setPendingTarget(null);
  if(viewport.current)viewport.current.scrollTop=0;
 },[program]);
 useEffect(()=>{
  const element=viewport.current;if(!element)return;
  let lastWidth=0;
  const observer=new ResizeObserver(()=>{
   setSize({width:element.clientWidth,height:element.clientHeight});
   if(element.offsetWidth!==lastWidth){setZoom(clampZoom(Math.floor((element.clientWidth-24)/LADDER_WIDTH*100)/100));lastWidth=element.offsetWidth;}
  });
  observer.observe(element);return()=>observer.disconnect();
 },[program]);
 useEffect(()=>{
  const keydown=(event:KeyboardEvent)=>{
   if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='f'){event.preventDefault();const field=viewport.current?.closest('.app')?.querySelector<HTMLInputElement>('.search-query');field?.focus();field?.select();}
   if(event.key==='Escape')setMenu(null);
  };
  window.addEventListener('keydown',keydown);return()=>window.removeEventListener('keydown',keydown);
 },[]);
 useEffect(()=>{
  if(!menu)return;
  const close=()=>setMenu(null);window.addEventListener('pointerdown',close);window.addEventListener('resize',close);
  return()=>{window.removeEventListener('pointerdown',close);window.removeEventListener('resize',close);};
 },[menu]);
 useEffect(()=>{
  if(!pendingTarget||!viewport.current)return;
  const element=viewport.current;
  const index=instructionNetworks.get(pendingTarget.id);
  if(index===undefined){setPendingTarget(null);return;}
  const symbol=drawings[index].symbols.find(symbol=>keyenceSymbolOwns(symbol,pendingTarget.id));
  const networkElement=element.querySelector<HTMLElement>('[data-network="'+networks[index].id+'"]');
  if(!symbol){setPendingTarget(null);return;}
  if(!networkElement)return;
  const section=networkElement.querySelector<HTMLElement>('.network-scroll'),scroller=section??element;
  const origin=section?0:networkElement.getBoundingClientRect().left-element.getBoundingClientRect().left+element.scrollLeft;
  const left=origin+symbol.x*zoom,right=origin+(symbol.x+symbol.width)*zoom;
  if(left<scroller.scrollLeft||right>scroller.scrollLeft+scroller.clientWidth)
   scroller.scrollLeft=Math.max(0,left-24);
  setPendingTarget(null);
 },[pendingTarget,visible,drawings,zoom]);
 const moveTo=(index:number,item?:KeyenceInstruction)=>{
  setSelectedNetwork(networks[index].id);
  if(item){
   setSelected(item.id);setPendingTarget(item);
  }
  const element=viewport.current;
  if(element){
   const symbol=item&&drawings[index].symbols.find(symbol=>keyenceSymbolOwns(symbol,item.id));
   const target=dimensions.offsets[index]+(symbol?Math.max(0,symbol.y*zoom-60):0);
   element.scrollTop=Math.max(0,Math.min(target,element.scrollHeight-element.clientHeight));setScrollTop(element.scrollTop);
  }
 };
 const select=(item:KeyenceInstruction)=>{setSelected(item.id);const index=instructionNetworks.get(item.id);if(index!==undefined)setSelectedNetwork(networks[index].id);};
 const searchMove=(direction:number)=>{
  if(!matches.length)return;
  const index=searchIndex<0?(direction<0?matches.length-1:0):(searchIndex+direction+matches.length)%matches.length;setSearchIndex(index);
  const item=matches[index],networkIndex=instructionNetworks.get(item.id);
  if(networkIndex!==undefined)moveTo(networkIndex,item);
 };
 useEffect(()=>{
  setSearchIndex(matches.length?0:-1);
  const item=matches[0],index=item&&instructionNetworks.get(item.id);
  if(item&&index!==undefined)moveTo(index,item);
 },[matches]);
 useLayoutEffect(()=>{
  const index=viewAnchor.current,element=viewport.current;
  if(index===null||!element)return;
  viewAnchor.current=null;element.scrollTop=dimensions.offsets[index]??0;setScrollTop(element.scrollTop);
 },[viewMode,dimensions]);
 const changeViewMode=(next:'wrap'|'scroll')=>{
  if(next===viewMode)return;
  const selectedIndex=networks.findIndex(network=>network.id===selectedNetwork);
  const selectedVisible=selectedIndex>=0&&dimensions.offsets[selectedIndex]<scrollTop+size.height&&dimensions.offsets[selectedIndex]+dimensions.heights[selectedIndex]>scrollTop;
  viewAnchor.current=selectedVisible?selectedIndex:Math.max(0,dimensions.offsets.findIndex((offset,index)=>offset+dimensions.heights[index]>scrollTop));
  setViewMode(next);
 };
 const copyText=(item:KeyenceInstruction)=>keyenceInstructionCopyText(item,program);
 const contextMenu=(event:MouseEvent,item:KeyenceInstruction)=>{
  event.preventDefault();event.stopPropagation();select(item);setCopyError('');
  const bridge=nativeCsvBridge();
  if(bridge){bridge.postMessage({type:'instruction-menu',text:copyText(item)});return;}
  setMenu({x:Math.min(event.clientX,window.innerWidth-150),y:Math.min(event.clientY,window.innerHeight-60),instruction:item});
 };
 const copy=async(item:KeyenceInstruction)=>{
  setMenu(null);
  try{await navigator.clipboard.writeText(copyText(item));}
  catch{setCopyError('コピーできませんでした。');}
 };
 return <div class="app keyence-app" onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();if(event.dataTransfer?.files.length)drop(Array.from(event.dataTransfer.files));}}>
  <ViewerHeader onCompare={onCompare} programNames={names} currentName={program.name} description="KEYENCE" busy={busy} dark={dark} onChoose={choose} onToggleTheme={toggleTheme}
   onAbout={()=>nativeCsvBridge()?.postMessage({type:'show-about',dark})} onOpenFiles={openFiles} onOpenFolder={openFolder}/>
  <div class="subbar"><SearchBar query={query} mode={searchMode} results={searchResults} current={searchIndex} onQuery={setQuery} onMode={setSearchMode} onMove={searchMove} onClear={()=>setQuery('')} placeholder="デバイス・命令・コメント・元ファイル行"/>
   <div>{hasComments&&<label class="comment-toggle"><input type="checkbox" checked={showComments} onChange={event=>setShowComments(event.currentTarget.checked)}/>コメント</label>}
    <label class="ladder-palette">ラダー配色<select aria-label={`ラダー配色（${dark?'ダーク':'ライト'}モード）`} title={`${dark?'ダーク':'ライト'}モード用の配色`} value={palette} onChange={event=>changePalette(event.currentTarget.value)}>{[{value:'standard',label:'標準'},{value:'contrast',label:'高コントラスト'},{value:'soft',label:'目にやさしい'},{value:'cud',label:'色覚配慮（CUD）'},{value:'blue',label:'ブルー'}].map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
    <label class="view-mode">長い回路<select aria-label="長い回路の表示" value={viewMode} onChange={event=>changeViewMode(event.currentTarget.value as typeof viewMode)}><option value="wrap">折り返し</option><option value="scroll">横スクロール</option></select></label>
    <button onClick={fit}>幅に合わせる</button><button aria-label="縮小" onClick={()=>setZoom(value=>clampZoom(+(value-.1).toFixed(2)))}>−</button><button onClick={()=>setZoom(1)}>{Math.round(zoom*100)}%</button><button aria-label="拡大" onClick={()=>setZoom(value=>clampZoom(+(value+.1).toFixed(1)))}>＋</button>
   </div>
  </div>
  {(error||copyError)&&<div class="error" role="alert">{error||copyError}</div>}
  <div class="workspace">
   <aside class="navigation"><div class="panel-title">回路一覧<span>{networks.length}</span></div><div class="nav-list">{networks.map((network,index)=><button key={network.id} class={`nav-item${network.id===selectedNetwork?' active':''}`} onClick={()=>moveTo(index,network.instructions[0])}><span class="number">{String(index+1).padStart(3,'0')}</span><div><strong>{network.statement.split('\n')[0]||`元ファイル ${network.instructions[0].sourceLine}行`}</strong><small>{network.actions.map(action=>[action.instruction.opcode,...action.instruction.operands].join(' ')).join(' / ')}</small></div></button>)}</div></aside>
   <div ref={viewport} class="kv-diagram" onScroll={event=>{setScrollTop(event.currentTarget.scrollTop);setMenu(null);}}>
    {busy&&<div class="kv-loading" role="status">{progress}</div>}
    <div class="kv-canvas" style={{height:dimensions.total,minWidth:LADDER_WIDTH*zoom}}>{visible.map(index=><section key={networks[index].id} class="kv-network" data-network={networks[index].id} style={{top:dimensions.offsets[index],height:dimensions.heights[index]}}><HorizontalScroll enabled={scrolling[index]} width={LADDER_WIDTH*zoom} contentWidth={drawings[index].width*zoom} height={dimensions.heights[index]} label={`回路 元ファイル ${networks[index].instructions[0].sourceLine}行 横スクロール`}><KeyenceLadder drawing={drawings[index]} zoom={zoom} selected={selected} onSelect={select} onContextMenu={contextMenu}/></HorizontalScroll></section>)}</div>
   </div>
   <aside class="details"><div class="panel-title">命令の詳細</div>{instruction&&<div class="detail-content"><div class="eyebrow">元ファイル {instruction.sourceLine}行</div><h2>{instruction.opcode}</h2><dl>{instruction.operands.length>0&&<><dt>オペランド</dt><dd>{instruction.operands.map((operand,index)=><div key={index} class="operand"><span>{index+1}</span><code>{operand}</code></div>)}</dd></>}{keyenceInstructionComment(instruction,program)&&<><dt>コメント</dt><dd>{keyenceInstructionComment(instruction,program)}</dd></>}<dt>元ファイル</dt><dd>{program.name}</dd></dl></div>}</aside>
  </div>
  <footer><span class="status-dot"/>{program.moduleName||program.name} · {program.instructions.length} 命令 · {networks.length} 回路{Object.keys(program.deviceComments).length>0&&` · コメント ${Object.keys(program.deviceComments).length}件`}</footer>
  {menu&&<div class="kv-context-menu" role="menu" style={{left:menu.x,top:menu.y}} onPointerDown={event=>event.stopPropagation()}><button role="menuitem" onClick={()=>void copy(menu.instruction)}>コピー</button></div>}
 </div>;
}
