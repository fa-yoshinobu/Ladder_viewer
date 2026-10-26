import {csvRows,instructionFields,pinDefinition,isFunctionCall} from './gxFormat';
import {diffArrays} from 'diff';
import {gridLayout,drawingMetrics,ROW} from './layout';
import {compareConnections} from './connections';
import { buildProgram, type Instruction, type Network, type Program, type ComparisonChange } from './model';

export const isComparisonHeader = (row: string[]) => row[0] === '行' && row.includes('照合元') && row.includes('照合先') && (row.includes('照合結果') || row.includes('比較結果'));

// Statement and note lines in comparison results. GX Works3 prefixes both with ';'. GX Works2 (比較結果) shows statements as
// plain text and indents notes, wrapping embedded notes in <>. A leading '*' marks project-only text, which GX shows without it.
export function comparisonComment(raw: string, legacy: boolean): { kind: 'statement' | 'note'; text: string } | null {
  const text = raw.trim();
  if (text.startsWith(';')) return { kind: 'statement', text: text.slice(1).replace(/^\*/, '') };
  if (!legacy || !text || isFunctionCall(text) || pinDefinition(text)) return null;
  if (/^\s/.test(raw)) return { kind: 'note', text: text.replace(/^\*/, '').replace(/^<(.*)>$/, '$1') };
  // Keep uppercase mnemonics (including unknown ones) and pointers; lowercase headings are text.
  if (/^[*[]/.test(text) || /[a-z]|[^\x00-\x7f]/.test(text.split(/\s/)[0])) return { kind: 'statement', text: text.replace(/^\*/, '') };
  return null;
}

export function parseComparison(text: string, name: string): Program {
  const parsed = csvRows(text);
  if (parsed.errors.length) throw new Error(`CSV形式エラー: ${parsed.errors[0].message}`);
  const header = parsed.data.findIndex(isComparisonHeader);
  if (header < 0) throw new Error('照合元・照合先の列がありません。');
  const columns = parsed.data[header], sourceColumn = columns.indexOf('照合元'), targetColumn = columns.indexOf('照合先'), legacy = columns.includes('比較結果');
  if (columns[sourceColumn - 1] !== 'ステップ' || columns[targetColumn - 1] !== 'ステップ') throw new Error('照合元・照合先に対応するステップ列がありません。');
  const metadataRows = parsed.data.slice(0, header).map(row=>row[0] ?? '');
  const metadata = (key: string) => metadataRows.find(value=>value.startsWith(key + '：') || value.startsWith(key + ':'))?.slice(key.length + 1).trim() ?? '';
  const legacyDataName = (side: '照合元' | '照合先') => {
    const index = metadataRows.findIndex(value=>value.startsWith(side + '：') || value.startsWith(side + ':'));
    if (index < 0) return '';
    return /^\s*->\s*(.+?)\s*$/.exec(metadataRows[index + 1] ?? '')?.[1].split(/[\\/]/).at(-1)?.trim() ?? '';
  };
  const rows = parsed.data.slice(header + 1);
  if (!rows.length) throw new Error('照合データがありません。');
  if (rows.some(row=>row.length !== columns.length || !/^\d+$/.test(row[0]))) throw new Error('照合行の列数または行番号が不正です。');
  const tokens=(text:string)=>text.match(/"(?:[^"]|"")*"|\S+/g)??[];
  const records=(column:number)=>rows.flatMap((row,index)=>row[column].trim()?[{text:row[column].trim(),raw:row[column],step:row[column-1].trim(),csvRow:header+index+2}]:[]);
  const sourceRecords=records(sourceColumn),targetRecords=records(targetColumn);
  type RecordLine=typeof sourceRecords[number];
  const aligned:{source?:RecordLine;target?:RecordLine}[]=[];
  function alignRecords(source:RecordLine[],target:RecordLine[]) {
    const sourceKeys=source.map(r=>JSON.stringify(tokens(r.text))),targetKeys=target.map(r=>JSON.stringify(tokens(r.text)));
    let sourceIndex=0,targetIndex=0;
    const chunks=diffArrays(sourceKeys,targetKeys);
    for(let index=0;index<chunks.length;index++){
      const chunk=chunks[index];
      if(!chunk.added&&!chunk.removed){for(let i=0;i<chunk.count;i++)aligned.push({source:source[sourceIndex++],target:target[targetIndex++]});continue;}
      const removed:RecordLine[]=[],added:RecordLine[]=[];
      while(index<chunks.length&&(chunks[index].added||chunks[index].removed)){
        const part=chunks[index];
        if(part.removed)for(let i=0;i<part.count;i++)removed.push(source[sourceIndex++]);
        else for(let i=0;i<part.count;i++)added.push(target[targetIndex++]);
        index++;
      }
      index--;
      for(let i=0;i<Math.max(removed.length,added.length);i++)aligned.push({source:removed[i],target:added[i]});
    }
  }
  // Anchor complete unchanged circuits before matching individual commands with repeated prefixes.
  const circuits=(records:RecordLine[])=>{
    const instructions:Instruction[]=records.flatMap((record,index)=>{
      if(comparisonComment(record.raw,legacy))return [];
      const {op,operands}=instructionFields(record.text);
      return [{id:String(index),sourceRow:record.csvRow,step:record.step,op,operands,note:'',statement:''}];
    });
    return buildProgram(instructions,name).networks.map(network=>({
      start:Number(network.instructions[0].id),end:Number(network.instructions.at(-1)!.id)+1,
      key:JSON.stringify(network.instructions.map(instruction=>[instruction.op,...instruction.operands]))
    }));
  };
  const sourceCircuits=circuits(sourceRecords),targetCircuits=circuits(targetRecords);
  let sourceCircuit=0,targetCircuit=0,sourceStart=0,targetStart=0;
  for(const chunk of diffArrays(sourceCircuits.map(c=>c.key),targetCircuits.map(c=>c.key))){
    if(chunk.removed){sourceCircuit+=chunk.count;continue;}
    if(chunk.added){targetCircuit+=chunk.count;continue;}
    for(let index=0;index<chunk.count;index++){
      const source=sourceCircuits[sourceCircuit++],target=targetCircuits[targetCircuit++];
      alignRecords(sourceRecords.slice(sourceStart,source.start),targetRecords.slice(targetStart,target.start));
      alignRecords(sourceRecords.slice(source.start,source.end),targetRecords.slice(target.start,target.end));
      sourceStart=source.end;targetStart=target.end;
    }
  }
  alignRecords(sourceRecords.slice(sourceStart),targetRecords.slice(targetStart));
  const changes:ComparisonChange[]=[];
  let shiftedSteps=0;
  aligned.forEach((pair,index)=>{
    const sourceText=pair.source?.text??'',targetText=pair.target?.text??'';
    if(pair.source&&pair.target&&JSON.stringify(tokens(sourceText))===JSON.stringify(tokens(targetText))){if(pair.source.step!==pair.target.step)shiftedSteps++;return;}
    changes.push({sourceRow:pair.source?.csvRow??pair.target!.csvRow,alignmentRow:index+1,sourceCsvRow:pair.source?.csvRow,targetCsvRow:pair.target?.csvRow,sourceText,targetText,sourceStep:pair.source?.step??'',targetStep:pair.target?.step??'',kind:!pair.source?'added':!pair.target?'removed':'changed'});
  });
  const changesByAlignment=new Map(changes.map(change=>[change.alignmentRow,change]));
  function side(which:'source'|'target'): Program {
    const instructions: Instruction[]=[];
    let statement='';
    aligned.forEach((pair,index)=>{
      const record=pair[which];if(!record)return;
      const value=record.text;
      const comment=comparisonComment(record.raw,legacy);
      if(comment){
       const previous=instructions.at(-1);
       if(comment.kind==='note'&&previous)previous.note=[previous.note,comment.text].filter(Boolean).join('\n');
       else statement=[statement,comment.text].filter(Boolean).join('\n');
       return;
      }
      const {op,operands,note}=instructionFields(value);
      const other=pair[which==='source'?'target':'source'];
      const otherFields=instructionFields(other?.text??'');
      const change=changesByAlignment.get(index+1);
      const difference=change?{kind:change.kind,opChanged:change.kind==='changed'&&op!==otherFields.op,operandChanges:change.kind==='changed'?operands.flatMap((token,index)=>token!==otherFields.operands[index]?[index]:[]):[],otherText:other?.text??'',otherStep:other?.step??''}:undefined;
      instructions.push({id:`${which}-row-${record.csvRow}`,sourceRow:record.csvRow,comparisonRow:index+1,step:record.step,op,operands,note,statement,difference});statement='';
    });
    return buildProgram(instructions,name);
  }
  const source = side('source'), target = side('target');
  if (!source.instructions.length && !target.instructions.length) throw new Error('両側に命令がありません。');
  alignCircuitRows(source.networks,target.networks);
  compareConnections(source.networks,target.networks);
  source.comparison = { target, sourceProject: metadata('照合元プロジェクト') || metadata('照合元'), targetProject: metadata('照合先プロジェクト') || metadata('照合先'), sourceName: metadata('照合元データ名') || legacyDataName('照合元'), targetName: metadata('照合先データ名') || legacyDataName('照合先'), rowCount: rows.length,
    differentRows: changes.length, changes, shiftedSteps };
  return source;
}

// Networks sharing aligned instruction ranges stay together; original CSV rows remain source locations.
export function pairNetworks(source: Network[], target: Network[]): { source: Network[]; target: Network[] }[] {
  const entries = [...source.map(network=>({network, side:'source' as const})), ...target.map(network=>({network, side:'target' as const}))]
    .map(entry=>({...entry, start:Math.min(...entry.network.instructions.map(i=>i.comparisonRow??i.sourceRow)), end:Math.max(...entry.network.instructions.map(i=>i.comparisonRow??i.sourceRow))}))
    .sort((a,b)=>a.start-b.start);
  const groups: {source:Network[];target:Network[]}[]=[];
  let end=-1;
  for(const entry of entries) {
    if(entry.start>end) {groups.push({source:[],target:[]});end=entry.end;}
    else end=Math.max(end,entry.end);
    groups.at(-1)![entry.side].push(entry.network);
  }
  return groups;
}
function alignCircuitRows(source:Network[],target:Network[]) {
 for(const group of pairNetworks(source,target)){
  const descriptors=(networks:Network[])=>networks.flatMap(network=>{
   const grid=gridLayout(network);
   return Array.from({length:grid.rows},(_,row)=>({network,row,key:Math.max(0,...grid.symbols.filter(s=>s.row===row).map(s=>s.instruction.comparisonRow??0))}));
  });
  const a=descriptors(group.source),b=descriptors(group.target);
  const changes=diffArrays(a.map(r=>r.key),b.map(r=>r.key));
  const positionsA:number[]=[],positionsB:number[]=[];
  let slot=0;
  for(let index=0;index<changes.length;index++){
   const part=changes[index];
   if(!part.added&&!part.removed){for(let i=0;i<part.count;i++){positionsA.push(slot);positionsB.push(slot++);}continue;}
   let removed=0,added=0;
   while(index<changes.length&&(changes[index].added||changes[index].removed)){if(changes[index].removed)removed+=changes[index].count;else added+=changes[index].count;index++;}
   index--;
   for(let i=0;i<removed;i++)positionsA.push(slot+i);
   for(let i=0;i<added;i++)positionsB.push(slot+i);
   slot+=Math.max(removed,added);
  }
  const networks=[...group.source,...group.target];
  const notePadding=Math.max(0,...networks.map(network=>drawingMetrics(network,ROW).padding));
  for(const network of networks)network.comparisonNotePadding=notePadding;
  for(const [rows,positions] of [[a,positionsA],[b,positionsB]] as const){
   let start=0,previous:Network|undefined;
   rows.forEach((descriptor,index)=>{
    if(previous&&previous!==descriptor.network)start=positions[index-1]+1;
    (descriptor.network.rowAlignment??=[])[descriptor.row]=positions[index]-start;
    previous=descriptor.network;
   });
  }
 }
}
