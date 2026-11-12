import type { Instruction, Network } from './model';

export interface ControlFlow {
  kind: 'boundary' | 'branch' | 'loop' | 'exit' | 'return' | 'jump' | 'system';
  label: string;
  targetId?: string;
  targetStep?: string;
}

export interface ControlRange {
  kind: 'IF' | 'CASE' | 'STFOR' | 'WHILE' | 'REPEAT';
  start: Instruction;
  end?: Instruction;
  lane: number;
  branches: Instruction[];
}

const markers = new Set([
  'IF',
  'THEN',
  'ELSIF',
  'ELSE',
  'ENDIF',
  'CASE',
  'CASEOF',
  'CASEIF',
  'CASETHEN',
  'CASEELSE',
  'ENDCASE',
  'STFOR',
  'FORBY',
  'FORTO',
  'FORDO',
  'ENDFOR',
  'WHILE',
  'WHILEDO',
  'ENDWHILE',
  'REPEAT',
  'UNTIL',
  'ENDREPEAT',
  'EXIT',
  'FBRET',
  'STPUSH',
  'STPOP',
  '_TMALLOC',
  '_TMFREE',
  'JMPO',
]);
const conditions = new Set(['THEN', 'CASETHEN', 'WHILEDO', 'FORDO', 'ENDREPEAT']);
const starts = new Set(['IF', 'CASE', 'STFOR', 'WHILE', 'REPEAT']);
const endings: Record<string, ControlRange['kind']> = {
  ENDIF: 'IF',
  ENDCASE: 'CASE',
  ENDFOR: 'STFOR',
  ENDWHILE: 'WHILE',
  ENDREPEAT: 'REPEAT',
};
const systemLabels: Record<string, string> = {
  STPUSH: '生成スタック保存',
  STPOP: '生成スタック復元',
  _TMALLOC: '一時領域確保',
  _TMFREE: '一時領域解放',
};

export const isControlMarker = (op: string): boolean => markers.has(op);
export const isMemoryControl = (op: string): boolean => op === '_TMALLOC' || op === '_TMFREE';
export const consumesCondition = (op: string): boolean => conditions.has(op);

interface Frame {
  range: ControlRange;
  network: Network;
  phase: 'condition' | 'body' | 'else' | 'selector' | 'case-ready' | 'case-condition' | 'until';
  markers: Set<string>;
  gate?: Instruction;
  finish: Instruction[];
  exits: { instruction: Instruction; network: Network }[];
}

const isLoop = (kind: ControlRange['kind']) =>
  kind === 'STFOR' || kind === 'WHILE' || kind === 'REPEAT';
function pointerKey(value: string): string | undefined {
  const match = /^(GLP|#?P)(\d+)$/i.exec(value);
  if (!match) return undefined;
  const number = Number(match[2]);
  const namespace = match[1].toUpperCase() === 'GLP' ? 'GLP' : 'P';
  return Number.isSafeInteger(number) ? namespace + number : undefined;
}

export function assignControlFlow(networks: Network[]): void {
  const active: Frame[] = [];
  const pointers = new Map<string, Instruction[]>();
  for (const network of networks) {
    delete network.controlRanges;
    for (const instruction of network.instructions) {
      delete instruction.controlFlow;
      const pointer = pointerKey(instruction.op);
      if (pointer) {
        const definitions = pointers.get(pointer) ?? [];
        definitions.push(instruction);
        pointers.set(pointer, definitions);
      }
    }
  }
  const warn = (network: Network, instruction: Instruction, message: string) => {
    const text = instruction.op + '（STEP ' + (instruction.step || '?') + '）: ' + message;
    if (!network.warnings.includes(text)) network.warnings.push(text);
  };
  const invalid = (network: Network, instruction: Instruction, message: string) => {
    instruction.controlFlow = { kind: 'boundary', label: '対応不明' };
    warn(network, instruction, message);
  };
  const link = (instruction: Instruction, target: Instruction) => {
    if (instruction.controlFlow) {
      instruction.controlFlow.targetId = target.id;
      instruction.controlFlow.targetStep = target.step;
    }
  };
  const expect = (
    kind: ControlRange['kind'],
    network: Network,
    instruction: Instruction,
  ): Frame | undefined => {
    const frame = active.at(-1);
    if (frame?.range.kind === kind) return frame;
    invalid(network, instruction, kind + 'の内側ではないか、別の制御範囲が閉じていません。');
    return undefined;
  };
  const branch = (frame: Frame, instruction: Instruction, label: string) => {
    instruction.controlFlow = { kind: 'branch', label };
    frame.range.branches.push(instruction);
  };
  const nextBranch = (frame: Frame, instruction: Instruction) => {
    if (frame.gate) link(frame.gate, instruction);
    frame.gate = undefined;
  };

  for (const network of networks) {
    const touched = new Set(active.map((frame) => frame.range));
    for (const instruction of network.instructions) {
      const op = instruction.op;
      if (starts.has(op)) {
        const kind = op as ControlRange['kind'];
        const range: ControlRange = { kind, start: instruction, lane: active.length, branches: [] };
        instruction.controlFlow = { kind: isLoop(kind) ? 'loop' : 'boundary', label: op + '開始' };
        active.push({
          range,
          network,
          phase: op === 'CASE' ? 'selector' : op === 'REPEAT' ? 'body' : 'condition',
          markers: new Set(),
          finish: [],
          exits: [],
        });
        touched.add(range);
        continue;
      }
      const ending = Object.hasOwn(endings, op) ? endings[op] : undefined;
      if (ending) {
        const frame = expect(ending, network, instruction);
        if (!frame) continue;
        if (frame.range.kind === 'IF' && frame.phase === 'condition') {
          warn(network, instruction, '対応する条件にTHENがありません。');
        } else if (
          frame.range.kind === 'CASE' &&
          (frame.phase === 'selector' || frame.phase === 'case-condition')
        ) {
          warn(network, instruction, 'CASEOFまたはCASETHENが不足しています。');
        } else if (frame.range.kind === 'STFOR' && frame.phase === 'condition') {
          warn(network, instruction, 'FORDOがありません。');
        } else if (frame.range.kind === 'WHILE' && frame.phase === 'condition') {
          warn(network, instruction, 'WHILEDOがありません。');
        } else if (frame.range.kind === 'REPEAT' && frame.phase !== 'until') {
          warn(network, instruction, '終了条件の前にUNTILがありません。');
        }
        instruction.controlFlow = {
          kind: isLoop(ending) ? 'loop' : 'boundary',
          label:
            ending === 'REPEAT' ? '不成立で反復' : isLoop(ending) ? '次の反復' : ending + '終了',
        };
        frame.range.end = instruction;
        active.pop();
        touched.add(frame.range);
        link(frame.range.start, instruction);
        nextBranch(frame, instruction);
        for (const marker of frame.finish) link(marker, instruction);
        for (const exit of frame.exits) link(exit.instruction, instruction);
        if (isLoop(ending)) link(instruction, frame.range.start);
        continue;
      }
      if (op === 'THEN') {
        const frame = expect('IF', network, instruction);
        if (!frame) continue;
        if (frame.phase !== 'condition') {
          invalid(network, instruction, '対応するIF/ELSIF条件がありません。');
          continue;
        }
        branch(frame, instruction, '不成立時の分岐');
        frame.gate = instruction;
        frame.phase = 'body';
        continue;
      }
      if (op === 'ELSIF' || op === 'ELSE') {
        const frame = expect('IF', network, instruction);
        if (!frame) continue;
        if (frame.phase !== 'body') {
          invalid(network, instruction, 'THENの前、またはELSEの後に置かれています。');
          continue;
        }
        nextBranch(frame, instruction);
        branch(frame, instruction, op === 'ELSIF' ? '次の条件' : 'それ以外');
        frame.finish.push(instruction);
        frame.phase = op === 'ELSIF' ? 'condition' : 'else';
        continue;
      }
      if (op === 'CASEOF' || op === 'CASEIF' || op === 'CASETHEN' || op === 'CASEELSE') {
        const frame = expect('CASE', network, instruction);
        if (!frame) continue;
        const valid =
          op === 'CASEOF'
            ? frame.phase === 'selector'
            : op === 'CASEIF' || op === 'CASEELSE'
              ? frame.phase === 'case-ready' || frame.phase === 'body'
              : frame.phase === 'case-condition';
        if (!valid) {
          invalid(network, instruction, 'CASEの分岐標識の順序が不正です。');
          continue;
        }
        if (op === 'CASEOF') {
          branch(frame, instruction, '選択値');
          frame.finish.push(instruction);
          frame.phase = 'case-ready';
        } else if (op === 'CASETHEN') {
          branch(frame, instruction, '不成立時の分岐');
          frame.gate = instruction;
          frame.phase = 'body';
        } else {
          nextBranch(frame, instruction);
          branch(frame, instruction, op === 'CASEIF' ? '選択条件' : 'それ以外');
          frame.finish.push(instruction);
          frame.phase = op === 'CASEIF' ? 'case-condition' : 'else';
        }
        continue;
      }
      if (
        op === 'FORBY' ||
        op === 'FORTO' ||
        op === 'FORDO' ||
        op === 'WHILEDO' ||
        op === 'UNTIL'
      ) {
        const kind = op === 'WHILEDO' ? 'WHILE' : op === 'UNTIL' ? 'REPEAT' : 'STFOR';
        const frame = expect(kind, network, instruction);
        if (!frame) continue;
        const expectedPhase = op === 'UNTIL' ? 'body' : 'condition';
        if (frame.phase !== expectedPhase || frame.markers.has(op)) {
          invalid(network, instruction, 'ループの判定・範囲指定の順序が不正です。');
          continue;
        }
        frame.markers.add(op);
        if (op === 'FORBY' || op === 'FORTO') {
          instruction.controlFlow = { kind: 'boundary', label: op === 'FORBY' ? '増分' : '終了値' };
        } else {
          branch(frame, instruction, op === 'UNTIL' ? '終了条件' : '不成立で終了');
          frame.finish.push(instruction);
          frame.phase = op === 'UNTIL' ? 'until' : 'body';
        }
        continue;
      }
      if (op === 'EXIT') {
        instruction.controlFlow = { kind: 'exit', label: 'ループ脱出' };
        const frame = [...active].reverse().find((frame) => isLoop(frame.range.kind));
        if (frame) frame.exits.push({ instruction, network });
        else warn(network, instruction, '脱出対象のループがありません。');
        continue;
      }
      if (op === 'FBRET') {
        instruction.controlFlow = { kind: 'return', label: '呼出元へ戻る' };
        continue;
      }
      if (Object.hasOwn(systemLabels, op)) {
        instruction.controlFlow = { kind: 'system', label: systemLabels[op] };
        continue;
      }
      if (
        op === 'JMPO' &&
        !(instruction.operands.length === 1 && pointerKey(instruction.operands[0]))
      ) {
        instruction.controlFlow = { kind: 'jump', label: '生成ジャンプ' };
        continue;
      }
      if (op === 'JMP' || op === 'CJ' || op === 'SCJ' || op === 'JMPO') {
        instruction.controlFlow = { kind: 'jump', label: 'ポインターへ移動' };
        const key =
          instruction.operands.length === 1 ? pointerKey(instruction.operands[0]) : undefined;
        const definitions = key ? pointers.get(key) : undefined;
        if (definitions?.length === 1) link(instruction, definitions[0]);
        else warn(network, instruction, '一意のポインターへ解決できないため行先を表示しません。');
      }
    }
    if (touched.size) network.controlRanges = [...touched];
  }
  for (const frame of active) {
    warn(frame.network, frame.range.start, '対応する終端がありません。');
    for (const exit of frame.exits)
      warn(exit.network, exit.instruction, 'ループが閉じていないため脱出先を判定しません。');
  }
}
