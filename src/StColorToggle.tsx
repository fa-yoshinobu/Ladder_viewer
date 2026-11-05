import {useEffect,useState} from 'preact/hooks';

export function StColorToggle(){
 const [enabled,setEnabled]=useState(()=>{try{return localStorage.getItem('stHighlight')==='true';}catch{return false;}});
 useEffect(()=>{document.documentElement.dataset.stHighlight=String(enabled);},[enabled]);
 return <label class="comment-toggle"><input type="checkbox" checked={enabled} onChange={event=>{
  const next=event.currentTarget.checked;setEnabled(next);try{localStorage.setItem('stHighlight',String(next));}catch{}
 }}/>ST色分け</label>;
}
