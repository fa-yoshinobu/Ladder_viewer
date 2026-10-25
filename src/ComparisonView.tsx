import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'preact/hooks';
import {differenceLabels,type Instruction,type Program,type Network} from './model';
import type {DeviceComments} from './comments';
import {pairNetworks} from './comparison';
import {LADDER_WIDTH,SCROLLBAR_HEIGHT,gridLayout,networkSize,type LadderViewMode} from './layout';
import {NetworkDrawing,drawingHeight} from './NetworkDrawing';
import {MasterControlScope} from './MasterControlScope';
import type {MasterControlRange} from './masterControl';
export type CompareSide='source'|'target';

export function comparisonBlockSize(group:{source:Network[];target:Network[]},rowHeight:number,zoom:number,viewMode:LadderViewMode) {
 const sharedScroll=viewMode==='scroll'&&(group.source.length>1||group.target.length>1)&&[...group.source,...group.target].some(n=>gridLayout(n).pages>1);
 const height=(networks:Network[])=>networks.reduce((sum,n)=>sum+drawingHeight(n,rowHeight,zoom,viewMode,!sharedScroll),0);
 const sourceHeight=height(group.source),targetHeight=height(group.target),bar=sharedScroll?SCROLLBAR_HEIGHT:0;
 return {sharedScroll,sourceHeight:sourceHeight+bar,targetHeight:targetHeight+bar,height:Math.max(sourceHeight,targetHeight,rowHeight*zoom)+bar};
}

export function ComparisonView({program,zoom,rowHeight,selected,choose,comments,showComments,viewMode='wrap'}:{program:Program;zoom:number;rowHeight:number;selected:string;choose:(instruction:Instruction|null,side:CompareSide)=>void;comments:DeviceComments;showComments:boolean;viewMode?:LadderViewMode}) {
 const comparison=program.comparison!;
 const sourceScroll=useRef<HTMLDivElement>(null),targetScroll=useRef<HTMLDivElement>(null);
 const [viewport,setViewport]=useState({top:0,height:800});
 const [active,setActive]=useState(0),[currentChange,setCurrentChange]=useState(-1);
 const blocks=useMemo(()=>{
  let top=8,previousEnd=-1;
  const groups=pairNetworks(program.networks,comparison.target.networks);
  const carry:Partial<Record<CompareSide,{network:Network;ranges:MasterControlRange[]}>>={};
  return groups.map((group,index)=>{
   const size=comparisonBlockSize(group,rowHeight,zoom,viewMode),height=size.height;
   const end=index===groups.length-1?Infinity:[...group.source,...group.target].reduce((end,n)=>n.instructions.reduce((end,i)=>Math.max(end,i.comparisonRow??i.sourceRow),end),previousEnd);
   const changes=comparison.changes.filter(change=>change.alignmentRow>previousEnd&&change.alignmentRow<=end);
   previousEnd=end;
   const scopes=(side:CompareSide)=>{
    const networks=group[side],carried=carry[side];
    if(!networks.length)return carried?.ranges.length?[{...carried,top:0,height,prefix:0,continuationOnly:true}]:[];
    let scopeTop=0;
    const overlays=networks.map((network,networkIndex)=>{
     const contentHeight=drawingHeight(network,rowHeight,zoom,viewMode,!size.sharedScroll);
     const overlay={network,ranges:network.masterControlRanges??[],top:scopeTop,height:networkIndex===networks.length-1?height-scopeTop:contentHeight,prefix:(network.title?network.title.split('\n').length*18*zoom:0)+network.warnings.length*25,continuationOnly:false};
     scopeTop+=contentHeight;return overlay;
    });
    const last=networks[networks.length-1];
    carry[side]={network:last,ranges:(last.masterControlRanges??[]).filter(range=>!range.end||!last.instructions.some(instruction=>instruction.id===range.end?.id))};
    return overlays.filter(overlay=>overlay.ranges.length);
   };
   const block={...group,...size,top,height,changes,scopes:{source:scopes('source'),target:scopes('target')}};top+=height;return block;
  });
 },[program,zoom,rowHeight,viewMode]);
 const total=blocks.at(-1),width=LADDER_WIDTH*zoom;
 const visible=blocks.filter(block=>block.top+block.height>viewport.top-400&&block.top<viewport.top+viewport.height+400);
 const change=comparison.changes[currentChange];
 const previousGeometry=useRef({viewMode,blocks});
 useLayoutEffect(()=>{
  const previous=previousGeometry.current;
  if(previous.viewMode!==viewMode&&blocks.length){
   const index=Math.max(0,previous.blocks.findIndex(block=>block.top+block.height>viewport.top));
   const top=blocks[Math.min(index,blocks.length-1)].top;
   sourceScroll.current?.scrollTo({top});targetScroll.current?.scrollTo({top});
   setActive(index);
  }
  const element=sourceScroll.current;
  if(element)setViewport({top:element.scrollTop,height:element.clientHeight});
  previousGeometry.current={viewMode,blocks};
 },[blocks,viewMode]);

 useEffect(()=>{
  const observer=new ResizeObserver(()=>{
   const element=sourceScroll.current;
   if(element)setViewport({top:element.scrollTop,height:element.clientHeight});
  });
  if(sourceScroll.current)observer.observe(sourceScroll.current);
  return()=>observer.disconnect();
 },[]);
 function scroll(side:CompareSide,element:HTMLDivElement){
  const other=side==='source'?targetScroll.current:sourceScroll.current;
  if(other&&Math.abs(other.scrollTop-element.scrollTop)>1)other.scrollTop=element.scrollTop;
  setViewport({top:element.scrollTop,height:element.clientHeight});
 }
 function jump(index:number){
  const top=blocks[index].top;
  sourceScroll.current?.scrollTo({top});targetScroll.current?.scrollTo({top});
  const element=sourceScroll.current;
  if(element)setViewport({top:element.scrollTop,height:element.clientHeight});
  setActive(index);
 }
 function goDifference(index:number){
  setCurrentChange(index);
  const change=comparison.changes[index],blockIndex=blocks.findIndex(block=>block.changes.includes(change));
  if(blockIndex>=0)jump(blockIndex);
  const target=comparison.target.instructions.find(i=>i.comparisonRow===change.alignmentRow),source=program.instructions.find(i=>i.comparisonRow===change.alignmentRow);
  if(target)choose(target,'target');else if(source)choose(source,'source');else choose(null,'target');
 }
 function selectInstruction(i:Instruction,side:CompareSide){choose(i,side);setCurrentChange(comparison.changes.findIndex(change=>change.alignmentRow===i.comparisonRow));}
 return <div class="comparison-view">
  <aside class="navigation comparison-nav"><div class="panel-title">回路一覧 <span>{blocks.length}</span></div><div class="nav-list">{blocks.map((block,index)=>{
   const n=block.source[0]??block.target[0];
   return <button key={index} class={`nav-item ${active===index?'active':''} ${block.changes.length?'has-differences':''}`} onClick={()=>jump(index)}><span class="number">{String(index+1).padStart(3,'0')}</span><div><strong>{n.title||n.pointer?.op||`STEP ${n.step}`}</strong><small>{n.actions[0]?.instruction.op} {n.actions[0]?.instruction.operands.join(' ')}</small>{!!block.changes.length&&<small class="diff-nav-count">相違 {block.changes.length}行</small>}</div></button>;
  })}</div></aside>
  <div class="compare-area">
   <div class="diff-toolbar"><div class="diff-legend"><span class="diff-changed">変更</span><span class="diff-added">追加（先のみ）</span><span class="diff-removed">削除（元のみ）</span><span class="connection-legend">配線：赤＝元の接続／緑＝先の接続</span>{comparison.shiftedSteps>0&&<span class="shifted-steps">ステップ移動 {comparison.shiftedSteps}行（差分対象外）</span>}</div><div class="diff-navigation"><button disabled={!comparison.changes.length} onClick={()=>goDifference((currentChange<=0?comparison.changes.length:currentChange)-1)}>前の差分</button><select aria-label="差分行" disabled={!comparison.changes.length} value={currentChange} onChange={e=>goDifference(Number(e.currentTarget.value))}><option value={-1} disabled>{comparison.changes.length?`差分 ${comparison.changes.length}行`:'差分なし'}</option>{comparison.changes.map((change,index)=><option value={index} key={change.alignmentRow}>{index+1}/{comparison.changes.length} · CSV 元{change.sourceCsvRow??'—'}/先{change.targetCsvRow??'—'}行 · {differenceLabels[change.kind]}</option>)}</select><button disabled={!comparison.changes.length} onClick={()=>goDifference((currentChange+1)%comparison.changes.length)}>次の差分</button></div></div>
   {change&&<div class={`diff-preview diff-${change.kind}`}><div><b>比較元 · STEP {change.sourceStep||'—'}</b><code>{change.sourceText||'（なし）'}</code></div><div><b>比較先 · STEP {change.targetStep||'—'}</b><code>{change.targetText||'（なし）'}</code></div></div>}
   <div class="compare-columns">{(['source','target'] as const).map(side=><section class="compare-column" key={side}>
    <div class="compare-heading"><strong>{side==='source'?'比較元':'比較先'}</strong><span>{side==='source'?comparison.sourceProject:comparison.targetProject}</span><b>{side==='source'?comparison.sourceName:comparison.targetName}</b></div>
    <div class="diagram compare-scroll" role="region" tabIndex={0} ref={side==='source'?sourceScroll:targetScroll} aria-label={`${side==='source'?'比較元':'比較先'}ラダー表示`} onScroll={e=>scroll(side,e.currentTarget)}>
     <div style={{height:total?total.top+total.height+8:0,minWidth:width+24,position:'relative'}}>{visible.map(block=><div class={`comparison-block ${block.changes.length?'has-differences':''}`} key={block.top} style={{position:'absolute',top:block.top,left:12,width,minHeight:block.height}}>
      {block[side].length ? block.sharedScroll ? <div class="network-scroll comparison-group-scroll" style={{width,height:side==='source'?block.sourceHeight:block.targetHeight}} role="region" aria-label="長い回路の横スクロール" tabIndex={0}>
       <div style={{width:Math.max(LADDER_WIDTH,...block[side].map(n=>networkSize(n,rowHeight,viewMode).width))*zoom}}>{block[side].map(network=><div class={`network ${gridLayout(network).pages===1?'fixed-short-network':''}`} key={network.id} style={{width:networkSize(network,rowHeight,viewMode).width*zoom}}><NetworkDrawing network={network} viewMode={viewMode} showMasterScope={false} scrollContainer={false} zoom={zoom} rowHeight={rowHeight} selected={selected} choose={i=>selectInstruction(i,side)} comments={comments} showComments={showComments}/></div>)}</div>
      </div> : block[side].map(network=><div class="network" key={network.id} style={{width}}><NetworkDrawing network={network} viewMode={viewMode} showMasterScope={false} zoom={zoom} rowHeight={rowHeight} selected={selected} choose={i=>selectInstruction(i,side)} comments={comments} showComments={showComments}/></div>) : <div class="missing-circuit">この範囲に回路なし</div>}
      {block.scopes[side].map(scope=><div key={scope.network.id} style={{position:'absolute',top:scope.top,left:0,width,height:scope.height,pointerEvents:'none'}}><MasterControlScope network={scope.network} ranges={scope.ranges} continuationOnly={scope.continuationOnly} zoom={zoom} rowHeight={rowHeight} viewMode={viewMode} width={width} height={scope.height} prefix={scope.prefix}/></div>)}
     </div>)}</div>
    </div>
   </section>)}</div>
  </div>
 </div>;
}