import type {ComponentChildren} from 'preact';
import {differenceLabels} from './model';
export function DifferenceToolbar({options,current,previous,next,onPrevious,onNext,onChoose,extra}:{options:{index:number;label:string}[];current:number;previous:boolean;next:boolean;onPrevious:()=>void;onNext:()=>void;onChoose:(index:number)=>void;extra?:ComponentChildren}){
 return <div class="diff-toolbar"><div class="diff-legend"><span class="diff-changed">{differenceLabels.changed}</span><span class="diff-added">{differenceLabels.added}</span><span class="diff-removed">{differenceLabels.removed}</span><span class="connection-legend">配線<i class="wire-swatch wire-removed"/>比較元の接続<i class="wire-swatch wire-added"/>比較先の接続</span>{extra}</div><div class="diff-navigation">
  <button disabled={!previous} onClick={onPrevious}>前の差分</button><select aria-label="差分のある回路" disabled={!options.length} value={current} onChange={e=>onChoose(Number(e.currentTarget.value))}><option value={-1} disabled>{options.length?`差分のある回路 ${options.length}`:'差分なし'}</option>{options.map((option,order)=><option key={option.index} value={option.index}>{order+1}/{options.length} · {option.label}</option>)}</select><button disabled={!next} onClick={onNext}>次の差分</button>
 </div></div>;
}
