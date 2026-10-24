import Papa from 'papaparse';
export type DifferenceKind = 'changed' | 'added' | 'removed' | 'step';
export const differenceLabels = { changed:'変更', added:'追加', removed:'削除', step:'ステップのみ' };
export interface ComparisonChange { sourceRow:number; sourceText:string; targetText:string; sourceStep:string; targetStep:string; kind:DifferenceKind; }

export interface Instruction { id: string; sourceRow: number; step: string; op: string; operands: string[]; note: string; statement: string; pins?: Instruction[]; difference?: { kind:DifferenceKind; opChanged:boolean; operandChanges:number[]; otherText:string; otherStep:string; }; }
export type Logic = { kind: 'contact'; instruction: Instruction } | { kind: 'and' | 'or'; children: Logic[] };
export interface Action { instruction: Instruction; condition: Logic | null; }
export interface Network { id: string; title: string; step: string; instructions: Instruction[]; actions: Action[]; warnings: string[]; pointer?: Instruction; }
export interface Program { name: string; cpu: string; instructions: Instruction[]; networks: Network[]; warnings: string[]; comparison?: { target: Program; sourceProject: string; targetProject: string; sourceName: string; targetName: string; differentRows: number; rowCount: number; changes: ComparisonChange[] }; }
export const instructionKey = (i: Instruction) => JSON.stringify([i.op, i.operands]);

export function decodeCsv(bytes: ArrayBuffer): string {
  const b = new Uint8Array(bytes);
  const encoding = b[0] === 255 && b[1] === 254 ? 'utf-16le' : b[0] === 254 && b[1] === 255 ? 'utf-16be' : 'utf-8';
  try { return new TextDecoder(encoding, { fatal: true }).decode(bytes); }
  catch { return new TextDecoder('shift_jis', { fatal: true }).decode(bytes); }
}
export function parseProgram(text: string, name: string): Program {
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { delimiter: '\t', skipEmptyLines: true });
  if (parsed.errors.length) throw new Error(`CSV形式エラー: ${parsed.errors[0].message}`);
  const rows = parsed.data;
  const header = rows.findIndex(r => r.includes('ステップ番号') && r.includes('命令'));
  if (header < 0) throw new Error('この試作版は「ステップ番号・命令・I/O(デバイス)」列のあるGX命令リストに対応しています。');
  const cols = rows[header];
  const get = (r: string[], key: string) => r[cols.indexOf(key)]?.trim() ?? '';
  const instructions: Instruction[] = [];
  let statement = '';
  rows.slice(header + 1).forEach((r, index) => {
    statement = [statement, get(r, '行間ステートメント'), get(r, 'PIステートメント')].filter(Boolean).join('\n');
    const op = get(r, '命令');
    const operand = get(r, 'I/O(デバイス)');
    const note = get(r, 'ノート');
    if (op) {
      instructions.push({ id: `row-${header + index + 2}`, sourceRow: header + index + 2, step: get(r, 'ステップ番号'), op, operands: operand ? [operand] : [], note, statement });
      statement = '';
    } else if (operand || note) {
      const prev = instructions.at(-1);
      if (!prev) throw new Error(`CSV ${header + index + 2}行: 命令のないオペランドです。`);
      if (operand) prev.operands.push(operand);
      if (note) prev.note = [prev.note, note].filter(Boolean).join('\n');
    }
  });
  if (!instructions.length) throw new Error('命令がありません。');
  return buildProgram(instructions, name, rows.find(r => r[0]?.includes('機種情報'))?.[1] ?? '');
}
export function buildProgram(instructions: Instruction[], name: string, cpu = ''): Program {
  const program: Program = { name, cpu, instructions, networks: [], warnings: [] };
  let current: Logic | null = null;
  let logicStack: Logic[] = [];
  let branchStack: (Logic | null)[] = [];
  let network: Network | null = null;
  const ensure = (i: Instruction): Network => network ??= { id: i.id, title: i.statement, step: i.step, instructions: [], actions: [], warnings: [] };
  const flush = () => {
    if (!network) return;
    if (logicStack.length || branchStack.length) network.warnings.push('分岐スタックが閉じていません。元命令を確認してください。');
    if (!network.actions.length) network.warnings.push('出力のない命令列です。元命令を表示します。');
    program.networks.push(network); network = null; current = null; logicStack = []; branchStack = [];
  };
  const combine = (kind: 'and' | 'or', a: Logic | null, b: Logic): Logic => a ? { kind, children: [a, b] } : b;
  const joinsPrevious = (index: number) => {
    let depth = 1;
    for (let cursor=index+1;cursor<instructions.length;cursor++) { const next=instructions[cursor];
      if (/^LD(?:I|P|F|PI|FI|[DE]?[=<>]+)?$/.test(next.op)) depth++;
      else if (next.op === 'ANB' || next.op === 'ORB') { if (--depth === 0) return true; }
      else if (!/^(AND|ANI|OR|INV$|MEP$|MEF$)/.test(next.op)) return false;
    }
    return false;
  };
  let lastFb: Instruction | null = null;
  for (const [index, i] of instructions.entries()) {
    if (/^.+ (?:IN|OUT|IN_OUT):/.test(i.op) && lastFb) { ensure(i).instructions.push(i); (lastFb.pins ??= []).push(i); continue; }
    lastFb = null;
    if (/^P\d+$/.test(i.op)) {
      flush();
      const n = ensure(i); n.instructions.push(i); n.pointer = i;
      continue;
    }
    const load = /^LD(?:I|P|F|PI|FI|[DE]?[=<>]+)?$/.test(i.op);
    const and = /^AN(?:D(?:PI|FI|P|F|[DE]?[=<>]+)?|I)$/.test(i.op);
    const or = /^OR(?:PI|FI|I|P|F|[DE]?[=<>]+)?$/.test(i.op);
    const control = /^(FOR|NEXT|FEND|END|RET|NOPLF)$/.test(i.op);
    const hasActions = (network as Network | null)?.actions.length;
    if ((control && (hasActions || !(network as Network | null)?.pointer)) || (load && hasActions && !branchStack.length && !joinsPrevious(index))) flush();
    const n = ensure(i); n.instructions.push(i);
    if (load) {
      if (current) logicStack.push(current);
      current = { kind: 'contact', instruction: i };
    } else if (and || or) {
      if (!current) n.warnings.push(`${i.op}: 前置条件がありません。`);
      current = combine(and ? 'and' : 'or', current, { kind: 'contact', instruction: i });
    } else if (/^(INV|MEP|MEF)$/.test(i.op)) {
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
      if (i.op.startsWith('FBCALL ')) lastFb = i;
      if (control) flush();
    }
  }
  flush();
  return program;
}
