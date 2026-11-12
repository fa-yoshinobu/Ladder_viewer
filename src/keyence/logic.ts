import { requireValue } from '../requireValue';
import type { KeyenceInstruction, KeyenceProgram, KeyenceScriptDisplay } from './model';

export type KeyenceExpression =
  | {
      kind: 'contact';
      instruction: KeyenceInstruction;
      negated: boolean;
      pulse: 'rise' | 'fall' | null;
      comparison: string | null;
    }
  | {
      kind: 'unary';
      instruction: KeyenceInstruction;
      input: KeyenceExpression | null;
      operation: 'rise' | 'fall' | 'invert';
    }
  | { kind: 'and' | 'or'; left: KeyenceExpression; right: KeyenceExpression };
export interface KeyenceAction {
  instruction: KeyenceInstruction;
  condition: KeyenceExpression | null;
  resetCondition?: KeyenceExpression | null;
  continuations?: KeyenceInstruction[];
  inputConditions?: { name: string; condition: KeyenceExpression | null }[];
  controlLevel?: number;
}
export interface KeyenceNetwork {
  id: string;
  statement: string;
  instructions: KeyenceInstruction[];
  actions: KeyenceAction[];
  condition: KeyenceExpression | null;
  warnings: string[];
  disabled?: boolean;
  script?: KeyenceScriptDisplay;
  scriptRange?: { id: string; start: boolean; end: boolean };
}
type ContactSpec = {
  join: 'load' | 'and' | 'or';
  negated: boolean;
  pulse: 'rise' | 'fall' | null;
  comparison: string | null;
};
const contactOps: Record<string, [ContactSpec['join'], boolean, ContactSpec['pulse']]> = {
  LD: ['load', false, null],
  LDB: ['load', true, null],
  LDP: ['load', false, 'rise'],
  LDF: ['load', false, 'fall'],
  LDPB: ['load', true, 'rise'],
  LDFB: ['load', true, 'fall'],
  AND: ['and', false, null],
  ANB: ['and', true, null],
  ANP: ['and', false, 'rise'],
  ANF: ['and', false, 'fall'],
  ANPB: ['and', true, 'rise'],
  ANFB: ['and', true, 'fall'],
  OR: ['or', false, null],
  ORB: ['or', true, null],
  ORP: ['or', false, 'rise'],
  ORF: ['or', false, 'fall'],
  ORPB: ['or', true, 'rise'],
  ORFB: ['or', true, 'fall'],
  BLD: ['load', false, null],
  BLDB: ['load', true, null],
  BAND: ['and', false, null],
  BANB: ['and', true, null],
  BOR: ['or', false, null],
  BORB: ['or', true, null],
};
function contactSpec(opcode: string): ContactSpec | null {
  const op = opcode.toUpperCase(),
    spec = contactOps[op];
  if (op === 'FUNLD' || op === 'FUNAND' || op === 'FBEAND')
    return { join: op === 'FUNLD' ? 'load' : 'and', negated: false, pulse: null, comparison: op };
  if (spec)
    return {
      join: spec[0],
      negated: spec[1],
      pulse: spec[2],
      comparison: op.startsWith('B') ? 'B' : null,
    };
  if (op === 'STG') return { join: 'load', negated: false, pulse: null, comparison: 'STG' };
  const bit = /^(BLD|BLDB|BAND|BANB|BOR|BORB)\.D$/.exec(op);
  if (bit) {
    const [join, negated, pulse] = requireValue(contactOps[requireValue(bit[1])]);
    return { join, negated, pulse, comparison: 'B.D' };
  }
  const special = /^(LD|AND|OR)(WK|CAL)(B?)$/.exec(op);
  if (special)
    return {
      join: special[1] === 'LD' ? 'load' : special[1] === 'AND' ? 'and' : 'or',
      negated: !!special[3],
      pulse: null,
      comparison: requireValue(special[2]),
    };
  const compare = /^(LD|AND|OR)([<>=]+)(\.[A-Z]+)?$/.exec(op);
  return compare
    ? {
        join: compare[1] === 'LD' ? 'load' : compare[1] === 'AND' ? 'and' : 'or',
        negated: false,
        pulse: null,
        comparison: compare[2] + (compare[3] ?? ''),
      }
    : null;
}

const inputNames: Record<string, string[]> = {
  SFT: ['D', 'CLK', 'RES'],
  UDT: ['UP', 'DW', 'RES'],
  UDC: ['UP', 'DW', 'RES'],
  ITVL: ['PLS', 'PAUSE', 'RES'],
  'ITVL.S': ['PLS', 'PAUSE', 'RES'],
  PID: ['PAUSE', 'MANUAL', 'RES'],
};
const independentControls = new Set([
  'STP',
  'STE',
  'FOR',
  'FOR.D',
  'NEXT',
  'LABEL',
  'SBN',
  'RET',
  'INT',
  'RETI',
  'MCR',
  'GOTO',
  'END',
  'ENDH',
]);

export function keyenceContactKey(opcode: string, operands: string[]): string | undefined {
  const spec = contactSpec(opcode);
  return spec
    ? JSON.stringify(['contact', spec.negated, spec.pulse, spec.comparison, operands])
    : undefined;
}

export function keyenceSymbolDifferenceKind(
  i: KeyenceInstruction,
): NonNullable<KeyenceInstruction['difference']>['kind'] | undefined {
  const difference = i.difference;
  if (difference?.kind === 'changed' && difference.opChanged) {
    const otherOp = requireValue(difference.otherText.split(' ')[0]),
      own = contactSpec(i.opcode),
      other = contactSpec(otherOp);
    if (
      own &&
      other &&
      own.negated === other.negated &&
      own.pulse === other.pulse &&
      own.comparison === other.comparison &&
      difference.otherText === [otherOp, ...i.operands].join(' ')
    )
      return undefined;
  }
  return difference?.kind;
}

// KEYENCE ANB/ORB are b contacts. Block operations are ANL/ORL.
// Expression objects keep the identity of shared conditions saved by MPS.
export function buildKeyenceNetworks(program: KeyenceProgram): KeyenceNetwork[] {
  const networks: KeyenceNetwork[] = [];
  let current: KeyenceExpression | null = null,
    blocks: KeyenceExpression[] = [],
    saved: { condition: KeyenceExpression | null; depth: number }[] = [];
  let instructions: KeyenceInstruction[] = [],
    actions: KeyenceAction[] = [],
    warnings: string[] = [],
    statements: string[] = [];
  let restored = false,
    continuation = false;
  let nextControlLevel = 0;
  const controlLevels: number[] = [];
  const warn = (message: string) => {
    if (!warnings.includes(message)) warnings.push(message);
  };
  const flush = () => {
    if (!instructions.length) return;
    if (saved.length) warn('MPSに対応するMPPがありません。');
    if (blocks.length) warn('接点ブロックの結合命令が不足しています。');
    if (continuation) warn('CONの後に接続する命令がありません。');
    const annotationOnly = instructions.every((i) =>
      /^(BOOKMARK|RUNG_COMMENT|DISABLED_RUNG|END_DISABLED_RUNG)$/i.test(i.opcode),
    );
    const functionResult = instructions.some(
      (i) => i.fb?.knownSignature && /^(FUNLD|FBEAND)$/i.test(i.opcode),
    );
    if (!actions.length && !annotationOnly && !functionResult) warn('出力命令がありません。');
    networks.push({
      id: requireValue(instructions[0]).id,
      statement: statements.join('\n'),
      instructions,
      actions,
      condition: current,
      warnings,
      ...(instructions.some((i) => i.disabled) ? { disabled: true } : {}),
    });
    current = null;
    blocks = [];
    saved = [];
    instructions = [];
    actions = [];
    warnings = [];
    statements = [];
    restored = false;
    continuation = false;
  };
  for (const instruction of program.instructions) {
    const op = instruction.opcode.toUpperCase(),
      spec = contactSpec(op);
    if (op === 'DISABLED_RUNG' || op === 'END_DISABLED_RUNG') {
      if (op === 'DISABLED_RUNG') flush();
      instructions.push(instruction);
      if (instruction.statement) statements.push(instruction.statement);
      if (op === 'END_DISABLED_RUNG') flush();
      continue;
    }
    if ((op === 'AREA_ST' && instruction.st) || op === 'BOOKMARK' || op === 'RUNG_COMMENT') {
      flush();
      instructions.push(instruction);
      if (instruction.statement) statements.push(instruction.statement);
      if (instruction.st) actions.push({ instruction, condition: null });
      flush();
      continue;
    }
    if (independentControls.has(op)) {
      flush();
      instructions.push(instruction);
      if (instruction.statement) statements.push(instruction.statement);
      const action: KeyenceAction = { instruction, condition: null };
      if (op === 'MCR') action.controlLevel = controlLevels.pop();
      actions.push(action);
      flush();
      continue;
    }
    if (spec?.join === 'load' && actions.length && !saved.length && !restored) flush();
    instructions.push(instruction);
    if (instruction.statement) statements.push(instruction.statement);
    if (spec) {
      const contact: KeyenceExpression = {
        kind: 'contact',
        instruction,
        negated: spec.negated,
        pulse: spec.pulse,
        comparison: spec.comparison,
      };
      if (spec.join === 'load') {
        if (current) blocks.push(current);
        current = contact;
      } else if (current) current = { kind: spec.join, left: current, right: contact };
      else {
        warn(`${instruction.opcode}の前にLD接点がありません。`);
        current = contact;
      }
    } else if (op === 'MEP' || op === 'MEF' || op === 'INV') {
      current = {
        kind: 'unary',
        instruction,
        input: current,
        operation: op === 'MEP' ? 'rise' : op === 'MEF' ? 'fall' : 'invert',
      };
    } else if (op === 'ANL' || op === 'ORL') {
      const left = blocks.pop();
      if (left && current) current = { kind: op === 'ANL' ? 'and' : 'or', left, right: current };
      else warn(`${op}に対応する接点ブロックがありません。`);
    } else if (op === 'MPS') {
      if (!current) warn('MPSで保存する条件がありません。');
      saved.push({ condition: current, depth: blocks.length });
    } else if (op === 'MRD' || op === 'MPP') {
      const state = op === 'MPP' ? saved.pop() : saved.at(-1);
      if (state) {
        current = state.condition;
        blocks.length = state.depth;
        restored = true;
      } else warn(`${op}に対応するMPSがありません。`);
    } else if (op === 'CON') {
      if (!actions.length || continuation) warn('CONの接続元の命令がありません。');
      continuation = true;
    } else if (op === 'KEEP') {
      const setCondition = blocks.pop() ?? null;
      if (!setCondition || !current) warn('KEEPのSET/RES条件が不足しています。');
      actions.push({ instruction, condition: setCondition, resetCondition: current });
      current = setCondition;
      restored = false;
    } else if (inputNames[op]) {
      const third = current,
        second = blocks.pop() ?? null,
        first = blocks.pop() ?? null;
      const conditions = [first, second, third];
      if (conditions.some((condition) => !condition))
        warn(`${op}の${inputNames[op].join('/')}条件が不足しています。`);
      actions.push({
        instruction,
        condition: first,
        inputConditions: inputNames[op].map((name, index) => ({
          name,
          condition: conditions[index] ?? null,
        })),
      });
      current = first;
      restored = false;
    } else if (op === 'MC') {
      const controlLevel = nextControlLevel++;
      controlLevels.push(controlLevel);
      actions.push({ instruction, condition: current, controlLevel });
      flush();
    } else {
      if (continuation && actions.length) {
        (actions.at(-1)!.continuations ??= []).push(instruction);
        continuation = false;
      } else actions.push({ instruction, condition: current });
      restored = false;
    }
  }
  flush();
  return networks;
}
