import {useEffect,useMemo,useRef,useState} from 'preact/hooks';
import {differenceLabels,type Instruction,type Program} from './model';
import type {DeviceComments} from './comments';
import {pairNetworks} from './comparison';
import {LADDER_WIDTH} from './layout';
import {NetworkDrawing,drawingHeight} from './NetworkDrawing';
export type CompareSide='source'|'target';

export function ComparisonView({program,zoom,rowHeight,selected,choose,comments,showComments}:{program:Program;zoom:number;rowHeight:number;selected:string;choose:(instruction:Instruction|null,side:CompareSide)=>void;comments:DeviceComments;showComments:boolean}) {
 const comparison=program.comparison!;
 const sourceScroll=useRef<HTMLDivElement>(null),targetScroll=useRef<HTMLDivElement>(null);
 const [viewport,setViewport]=useState({top:0,height:800});
 const [active,setActive]=useState(0),[currentChange,setCurrentChange]=useState(-1);
 const blocks=useMemo(()=>{
  let top=8,previousEnd=-1;
  const groups=pairNetworks(program.networks,comparison.target.networks);
  return groups.map((group,index)=>{
   const height=Math.max(...(['source','target'] as const).map(side=>group[side].reduce((sum,n)=>sum+drawingHeight(n,rowHeight,zoom),0)),rowHeight*zoom);
   const end=index===groups.length-1?Infinity:[...group.source,...group.target].reduce((end,n)=>n.instructions.reduce((end,i)=>Math.max(end,i.sourceRow),end),previousEnd);
   const changes=comparison.changes.filter(change=>change.sourceRow>previousEnd&&change.sourceRow<=end);
   previousEnd=end;
   const block={...group,top,height,changes};top+=height;return block;
  });
 },[program,zoom,rowHeight]);
 const total=blocks.at(-1),width=LADDER_WIDTH*zoom;
 const visible=blocks.filter(block=>block.top+block.height>viewport.top-400&&block.top<viewport.top+viewport.height+400);
 const change=comparison.changes[currentChange];
 useEffect(()=>{
  const observer=new ResizeObserver(()=>setViewport(v=>({...v,height:sourceScroll.current?.clientHeight??800})));
  if(sourceScroll.current)observer.observe(sourceScroll.current);
  return()=>observer.disconnect();
 },[]);
 function scroll(side:CompareSide,element:HTMLDivElement){
  const other=side==='source'?targetScroll.current:sourceScroll.current;
  if(other&&Math.abs(other.scrollTop-element.scrollTop)>1)other.scrollTop=element.scrollTop;
  setViewport({top:element.scrollTop,height:element.clientHeight});
 }
 function jump(index:number){const top=blocks[index].top;sourceScroll.current?.scrollTo({top});targetScroll.current?.scrollTo({top});setViewport(v=>({...v,top}));setActive(index);}
 function goDifference(index:number){
  setCurrentChange(index);
  const change=comparison.changes[index],blockIndex=blocks.findIndex(block=>block.changes.includes(change));
  if(blockIndex>=0)jump(blockIndex);
  const target=comparison.target.instructions.find(i=>i.sourceRow===change.sourceRow),source=program.instructions.find(i=>i.sourceRow===change.sourceRow);
  if(target)choose(target,'target');else if(source)choose(source,'source');else choose(null,'target');
 }
 function selectInstruction(i:Instruction,side:CompareSide){choose(i,side);setCurrentChange(comparison.changes.findIndex(change=>change.sourceRow===i.sourceRow));}
 return <div class="comparison-view">
  <aside class="navigation comparison-nav"><div class="panel-title">回路一覧 <span>{blocks.length}</span></div><div class="nav-list">{blocks.map((block,index)=>{
   const n=block.source[0]??block.target[0];
   return <button key={index} class={`nav-item ${active===index?'active':''} ${block.changes.length?'has-differences':''}`} onClick={()=>jump(index)}><span class="number">{String(index+1).padStart(3,'0')}</span><div><strong>{n.title||n.pointer?.op||`STEP ${n.step}`}</strong><small>{n.actions[0]?.instruction.op} {n.actions[0]?.instruction.operands.join(' ')}</small>{!!block.changes.length&&<small class="diff-nav-count">相違 {block.changes.length}行</small>}</div></button>;
  })}</div></aside>
  <div class="compare-area">
   <div class="diff-toolbar"><div class="diff-legend"><span class="diff-changed">変更</span><span class="diff-added">追加（先のみ）</span><span class="diff-removed">削除（元のみ）</span><span class="diff-step">ステップのみ</span></div><div class="diff-navigation"><button disabled={!comparison.changes.length} onClick={()=>goDifference((currentChange<=0?comparison.changes.length:currentChange)-1)}>前の差分</button><select aria-label="差分行" disabled={!comparison.changes.length} value={currentChange} onChange={e=>goDifference(Number(e.currentTarget.value))}><option value={-1} disabled>{comparison.changes.length?`差分 ${comparison.changes.length}行`:'差分なし'}</option>{comparison.changes.map((change,index)=><option value={index} key={change.sourceRow}>{index+1}/{comparison.changes.length} · CSV {change.sourceRow}行 · {differenceLabels[change.kind]}</option>)}</select><button disabled={!comparison.changes.length} onClick={()=>goDifference((currentChange+1)%comparison.changes.length)}>次の差分</button></div></div>
   {change&&<div class={`diff-preview diff-${change.kind}`}><div><b>比較元 · STEP {change.sourceStep||'—'}</b><code>{change.sourceText||'（なし）'}</code></div><div><b>比較先 · STEP {change.targetStep||'—'}</b><code>{change.targetText||'（なし）'}</code></div></div>}
   <div class="compare-columns">{(['source','target'] as const).map(side=><section class="compare-column" key={side}>
    <div class="compare-heading"><strong>{side==='source'?'比較元':'比較先'}</strong><span>{side==='source'?comparison.sourceProject:comparison.targetProject}</span><b>{side==='source'?comparison.sourceName:comparison.targetName}</b></div>
    <div class="diagram compare-scroll" role="region" tabIndex={0} ref={side==='source'?sourceScroll:targetScroll} aria-label={`${side==='source'?'比較元':'比較先'}ラダー表示`} onScroll={e=>scroll(side,e.currentTarget)}>
     <div style={{height:total?total.top+total.height+8:0,minWidth:width+24,position:'relative'}}>{visible.map(block=><div class={`comparison-block ${block.changes.length?'has-differences':''}`} key={block.top} style={{position:'absolute',top:block.top,left:12,width,minHeight:block.height}}>
      {block[side].length?block[side].map(network=><div class="network" key={network.id} style={{width}}><NetworkDrawing network={network} zoom={zoom} rowHeight={rowHeight} selected={selected} choose={i=>selectInstruction(i,side)} comments={comments} showComments={showComments}/></div>):<div class="missing-circuit">この範囲に回路なし</div>}
     </div>)}</div>
    </div>
   </section>)}</div>
  </div>
 </div>;
}