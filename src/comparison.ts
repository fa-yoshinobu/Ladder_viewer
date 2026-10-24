import Papa from 'papaparse';
import { buildProgram, type Instruction, type Network, type Program, type ComparisonChange } from './model';

export const isComparisonHeader = (row: string[]) => row[0] === '行' && row.includes('照合元') && row.includes('照合先') && row.includes('照合結果');

export function parseComparison(text: string, name: string): Program {
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { delimiter: '\t', skipEmptyLines: true });
  if (parsed.errors.length) throw new Error(`CSV形式エラー: ${parsed.errors[0].message}`);
  const header = parsed.data.findIndex(isComparisonHeader);
  if (header < 0) throw new Error('照合元・照合先の列がありません。');
  const columns = parsed.data[header], sourceColumn = columns.indexOf('照合元'), targetColumn = columns.indexOf('照合先');
  if (columns[sourceColumn - 1] !== 'ステップ' || columns[targetColumn - 1] !== 'ステップ') throw new Error('照合元・照合先に対応するステップ列がありません。');
  const metadata = (key: string) => parsed.data.slice(0, header).map(row=>row[0] ?? '').find(value=>value.startsWith(key + '：') || value.startsWith(key + ':'))?.slice(key.length + 1).trim() ?? '';
  const rows = parsed.data.slice(header + 1);
  if (!rows.length) throw new Error('照合データがありません。');
  if (rows.some(row=>row.length !== columns.length || !/^\d+$/.test(row[0]))) throw new Error('照合行の列数または行番号が不正です。');
  const changes:ComparisonChange[]=[];
  rows.forEach((row,index)=>{
    const sourceText=row[sourceColumn].trim(),targetText=row[targetColumn].trim();
    const sourceStep=row[sourceColumn-1].trim(),targetStep=row[targetColumn-1].trim();
    if(sourceText===targetText&&sourceStep===targetStep)return;
    changes.push({sourceRow:header+index+2,sourceText,targetText,sourceStep,targetStep,kind:!sourceText?'added':!targetText?'removed':sourceText===targetText?'step':'changed'});
  });
  const changesByRow=new Map(changes.map(change=>[change.sourceRow,change]));
  function side(column: number, prefix: string): Program {
    const instructions: Instruction[] = [];
    let statement = '';
    rows.forEach((row, index) => {
      const value = row[column].trim();
      if (!value) return;
      if (value.startsWith(';')) { statement = [statement, value.slice(1)].filter(Boolean).join('\n'); return; }
      const tokens = value.match(/"(?:[^"]|"")*"|\S+/g)!;
      const op = tokens.shift()!;
      const sourceRow = header + index + 2;
      const change=changesByRow.get(sourceRow);
      const otherColumn=column===sourceColumn?targetColumn:sourceColumn;
      const otherTokens=row[otherColumn].trim().match(/"(?:[^"]|"")*"|\S+/g)??[];
      const difference=change?{kind:change.kind,opChanged:op!==otherTokens[0],operandChanges:tokens.flatMap((token,index)=>token!==otherTokens[index+1]?[index]:[]),otherText:row[otherColumn].trim(),otherStep:row[otherColumn-1].trim()}:undefined;
      instructions.push({ id: `${prefix}-row-${sourceRow}`, sourceRow, step: row[column - 1].trim(), op, operands: tokens, note: '', statement, difference });
      statement = '';
    });
    return buildProgram(instructions, name);
  }
  const source = side(sourceColumn, 'source'), target = side(targetColumn, 'target');
  if (!source.instructions.length && !target.instructions.length) throw new Error('両側に命令がありません。');
  source.comparison = { target, sourceProject: metadata('照合元プロジェクト'), targetProject: metadata('照合先プロジェクト'), sourceName: metadata('照合元データ名'), targetName: metadata('照合先データ名'), rowCount: rows.length,
    differentRows: changes.length, changes };
  return source;
}

// Networks sharing CSV row ranges stay in the same display block, even when only one side adds a rung.
export function pairNetworks(source: Network[], target: Network[]): { source: Network[]; target: Network[] }[] {
  const entries = [...source.map(network=>({network, side:'source' as const})), ...target.map(network=>({network, side:'target' as const}))]
    .map(entry=>({...entry, start:Math.min(...entry.network.instructions.map(i=>i.sourceRow)), end:Math.max(...entry.network.instructions.map(i=>i.sourceRow))}))
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