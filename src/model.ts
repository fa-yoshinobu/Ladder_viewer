import {csvRows, gxInstructions, instructionFields, isFunctionCall, pinDefinition} from './gxFormat';
import {assembleFunctionBlocks, type FunctionBlock} from './functionBlocks';
import { assignControlFlow, consumesCondition, isControlMarker, isMemoryControl, type ControlFlow, type ControlRange } from './controlFlow';
import { contactKey, isInlineLogic, isPointerDefinition, logicOperation } from './instructions';
import { assignMasterControlRanges, type MasterControlRange } from './masterControl';
export type DifferenceKind = 'changed' | 'added' | 'removed' | 'step';
export const differenceLabels = { changed:'変更', added:'比較先のみ', removed:'比較元のみ', step:'ステップのみ' };
export interface ComparisonChange { sourceRow:number; alignmentRow:number; noteOwnerRow?:number; sourceCsvRow?:number; targetCsvRow?:number; sourceText:string; targetText:string; sourceStep:string; targetStep:string; kind:DifferenceKind; }

export interface Instruction { id: string; sourceRow: number; step: string; op: string; operands: string[]; note: string; statement: string; comparisonRow?:number; controlFlow?:ControlFlow; pins?: Instruction[]; piStatement?:string; inlineST?:{number:number;text:string;sourceRow:number;missing?:boolean}; block?:{id:string;kind:'FB'|'FUN';closed:boolean}; difference?: { kind:DifferenceKind; opChanged:boolean; operandChanges:number[]; otherText:string; otherStep:string; }; }
export function symbolDifferenceKind(i:Instruction):DifferenceKind|undefined {
 const difference=i.difference;
 if(difference?.kind==='changed'&&difference.opChanged){
  const other=instructionFields(difference.otherText);
  const key=contactKey(i.op,i.operands);
  if(key!==undefined&&key===contactKey(other.op,other.operands))return undefined;
 }
 return difference?.kind;
}
export type Logic = { kind: 'contact'; instruction: Instruction } | { kind: 'and' | 'or'; children: Logic[] };
export interface Action { instruction: Instruction; condition: Logic | null; }
export interface Network { id: string; title: string; step: string; instructions: Instruction[]; actions: Action[]; warnings: string[]; evaluation?:Logic; functionBlock?:FunctionBlock; pointer?: Instruction; masterControl?:Instruction; masterControlRanges?:MasterControlRange[]; controlRanges?:ControlRange[]; rowAlignment?:number[]; branchRowAlignment?:Record<string,number>; outputRowAlignment?:Record<string,number>; comparisonPageRows?:number[]; comparisonNotePadding?:number; connectionDifferences?: {kind:'added'|'removed'; wires:number[]; naturalWires?:number[]; inputs:string[]; outputs:string[]}; }
export interface Program { relativePath?:string;name: string; cpu: string; instructions: Instruction[]; networks: Network[]; warnings: string[]; comparison?: { target: Program; sourceProject: string; targetProject: string; sourceName: string; targetName: string; differentRows: number; rowCount: number; changes: ComparisonChange[]; shiftedSteps:number }; }
export const instructionKey = (i: Instruction) => JSON.stringify([i.op, i.operands]);

export function decodeCsv(bytes: ArrayBuffer): string {
  const b = new Uint8Array(bytes);
  const encoding = b[0] === 255 && b[1] === 254 ? 'utf-16le' : b[0] === 254 && b[1] === 255 ? 'utf-16be' : 'utf-8';
  try { return new TextDecoder(encoding, { fatal: true }).decode(bytes); }
  catch { return new TextDecoder('shift_jis', { fatal: true }).decode(bytes); }
}
export function parseProgram(text: string, name: string): Program {
  const parsed=csvRows(text);
  if(parsed.errors.length)throw new Error(`CSV形式エラー: ${parsed.errors[0].message}`);
  const rows=parsed.data,header=rows.findIndex(row=>row.includes('ステップ番号')&&row.includes('命令'));
  if(header<0)throw new Error('「ステップ番号・命令・I/O(デバイス)」列のあるGX命令リストに対応しています。');
  const instructions=gxInstructions(rows,header);
  if (!instructions.length) throw new Error('命令がありません。');
  return buildProgram(instructions, name, rows.find(r => r[0]?.includes('機種情報') || r[0]?.includes('PC情報'))?.[1] ?? '');
}
export function buildProgram(instructions: Instruction[], name: string, cpu = ''): Program {
  const program: Program = { name, cpu, instructions, networks: [], warnings: [] };
  let current: Logic | null = null;
  let logicStack: Logic[] = [];
  let branchStack: (Logic | null)[] = [];
  let network: Network | null = null;
  let pendingMasterControl:Instruction|undefined;
  let compiledDepth=0;
  const ensure = (i: Instruction): Network => {
    if(network)return network;
    network={id:i.id,title:[i.statement,i.piStatement].filter(Boolean).join('\n'),step:i.step,instructions:[],actions:[],warnings:[],masterControl:pendingMasterControl};
    pendingMasterControl=undefined;
    return network;
  };
  const flush = (evaluation = false) => {
    if (!network) return;
    if ((!compiledDepth&&logicStack.length) || branchStack.length) network.warnings.push('分岐スタックが閉じていません。元命令を確認してください。');
    if(evaluation && current && !network.actions.length)network.evaluation=current;
    if (!network.actions.length && !evaluation) network.warnings.push('出力のない命令列です。元命令を表示します。');
    program.networks.push(network); network = null; current = null; logicStack = []; branchStack = [];
  };
  const combine = (kind: 'and' | 'or', a: Logic | null, b: Logic): Logic => a ? { kind, children: [a, b] } : b;
  const joinsPrevious = (index: number) => {
    let depth = 1;
    for (let cursor=index+1;cursor<instructions.length;cursor++) { const next=instructions[cursor];
      if(isMemoryControl(next.op))continue;
      const operation=logicOperation(next.op);
      if (operation==='load') depth++;
      else if (next.op === 'ANB' || next.op === 'ORB') { if (--depth === 0) return true; }
      else if (operation!=='and'&&operation!=='or'&&!isInlineLogic(next.op)) return false;
    }
    return false;
  };
  let lastFb: Instruction | null = null;
  for (const [index, i] of instructions.entries()) {
    if(index&&instructions[index-1].block?.id!==i.block?.id)flush();
    if(i.block&&isFunctionCall(i.op))flush();
    if (pinDefinition(i.op) && lastFb) { ensure(i).instructions.push(i); (lastFb.pins ??= []).push(i); continue; }
    lastFb = null;
    if (isPointerDefinition(i.op)) {
      flush();
      const n = ensure(i); n.instructions.push(i); n.pointer = i;
      continue;
    }
    if(i.op==='PHASE') {
      flush();
      ensure(i).instructions.push(i);
      current={kind:'contact',instruction:i};
      continue;
    }
    if(i.op==='PHASERST') {
      if(network) {
        (network as Network).instructions.push(i);
        flush();
      }
      continue;
    }
    if(i.op==='STPUSH')compiledDepth++;
    if(isMemoryControl(i.op)) {
      const n=ensure(i);n.instructions.push(i);
      n.actions.push({instruction:i,condition:current});
      continue;
    }
    if(isControlMarker(i.op)) {
      const evaluated=consumesCondition(i.op);
      if(!evaluated || (network as Network | null)?.actions.some(action=>!isMemoryControl(action.instruction.op)))flush(true);
      const n=ensure(i);n.instructions.push(i);
      n.actions.push({instruction:i,condition:evaluated?current:null});
      flush();
      if(i.op==='STPOP')compiledDepth=Math.max(0,compiledDepth-1);
      continue;
    }
    const operation=logicOperation(i.op);
    const load=operation==='load',and=operation==='and',or=operation==='or';
    if(compiledDepth&&load&&current&&!branchStack.length&&!joinsPrevious(index))flush(true);
    const control = /^(FOR|NEXT|FEND|END|RET|IRET|MCR|JMP|NOP|DI|EI|IMASK|NOPLF)$/.test(i.op);
    if(i.op==='MCR')pendingMasterControl=undefined;
    const hasActions = (network as Network | null)?.actions.some(action=>!isMemoryControl(action.instruction.op));
    if ((control && (hasActions || !(network as Network | null)?.pointer)) || (load && hasActions && !branchStack.length && !joinsPrevious(index))) flush();
    const n = ensure(i); n.instructions.push(i);
    if (load) {
      if (current) logicStack.push(current);
      current = { kind: 'contact', instruction: i };
    } else if (and || or) {
      if (!current) n.warnings.push(`${i.op}: 前置条件がありません。`);
      current = combine(and ? 'and' : 'or', current, { kind: 'contact', instruction: i });
    } else if (isInlineLogic(i.op)) {
      current = combine('and', current, {kind:'contact',instruction:i});
    } else if (i.op === 'ANB' || i.op === 'ORB') {
      const prev = logicStack.pop();
      if (!prev || !current) n.warnings.push(`${i.op}: 条件スタックが不足しています。`);
      else current = combine(i.op === 'ANB' ? 'and' : 'or', prev, current);
    } else if (i.op === 'MPS') branchStack.push(current);
    else if (i.op === 'MRD' || i.op === 'MPP') {
      if (!branchStack.length) n.warnings.push(`${i.op}: 保存された分岐条件がありません。`);
      else current = i.op === 'MPP' ? branchStack.pop()! : branchStack.at(-1)!;
    } else {
      n.actions.push({ instruction: i, condition: current });
      if (isFunctionCall(i.op)) {lastFb = i;i.pins=[];}
      if (i.op==='MC')pendingMasterControl=i;
      if (control) flush();
    }
  }
  flush();
  assembleFunctionBlocks(program);
  for(const network of program.networks){
    if(network.instructions.some(i=>i.inlineST?.missing))network.warnings.push('インラインSTに対応する本文がありません。');
    if(network.instructions.some(i=>i.block&&!i.block.closed))network.warnings.push('FB/FUNの終了位置がありません。元の回路を表示します。');
  }
  assignMasterControlRanges(program.networks);
  assignControlFlow(program.networks);
  return program;
}
