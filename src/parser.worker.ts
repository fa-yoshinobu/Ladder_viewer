import {parseCsvBatch,type CsvInput} from './batch';
import {compareDirectPair,unchangedDirectPair,type DirectPair} from './directComparison';
self.onmessage=(event:MessageEvent<{files:CsvInput[];token:number}|{action:'compare';pair:DirectPair;token:number}|{action:'compare-index';pairs:DirectPair[];token:number}>)=>{
 const request=event.data,token=request.token;
 try{
  if('action' in request&&request.action==='compare-index'){const overview:Record<string,boolean>={};for(const [index,pair] of request.pairs.entries()){overview[pair.id]=unchangedDirectPair(pair);self.postMessage({token,overviewProgress:index+1});}self.postMessage({token,overview});}
  else if('action' in request&&request.action==='compare')self.postMessage({token,comparison:compareDirectPair(request.pair)});
  else if('files' in request){const result=parseCsvBatch(request.files,(done,total,name)=>self.postMessage({token,progress:`${done} / ${total}　${name}`}));self.postMessage({token,result});}
 }catch(error){self.postMessage({token,error:error instanceof Error?error.message:String(error)});}
};
