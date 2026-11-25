import { requireValue } from './requireValue';
import Papa from 'papaparse';
import type { Instruction } from './model';
import { isPointerDefinition } from './instructions';

export function csvRows(text: string, preview = 0) {
  const source = text.replace(/^\uFEFF/, '');
  const delimiter =
    ['\t', ','].find((delimiter) =>
      Papa.parse<string[]>(source, { delimiter, preview: 10, skipEmptyLines: 'greedy' }).data.some(
        (row) =>
          (row.includes('ステップ番号') && row.includes('命令')) ||
          (row[0]?.trim() === 'デバイス名' && row.length > 1) ||
          (row[0] === '行' && row.includes('照合元') && row.includes('照合先')),
      ),
    ) ?? '\t';
  return Papa.parse<string[]>(source, { delimiter, preview, skipEmptyLines: 'greedy' });
}
export const displayGxText = (text: string) => text.replace(/^\*/, '').replace(/\\r\\n/g, '\n');

// Quotes protect spaces and semicolons in string constants, including doubled quote characters.
export function commandParts(text: string): {
  tokens: string[];
  note: string;
  diagnostic?: string;
} {
  const tokens: string[] = [];
  let token = '',
    quote = '';
  for (let index = 0; index < text.length; index++) {
    const c = requireValue(text[index]);
    if (quote) {
      token += c;
      if (c === quote) {
        if (text[index + 1] === quote) token += text[++index];
        else quote = '';
      }
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      token += c;
    } else if (c === ';') {
      if (token) tokens.push(token);
      return { tokens, note: displayGxText(text.slice(index + 1).trim()) };
    } else if (/\s/.test(c)) {
      if (token) {
        tokens.push(token);
        token = '';
      }
    } else token += c;
  }
  if (quote) return { tokens: [], note: '', diagnostic: '文字列定数の引用符が閉じていません。' };
  if (token) tokens.push(token);
  return { tokens, note: '' };
}
export const isFunctionCall = (op: string) => /^(?:FBCALL|FUNCALL)\s+/.test(op);
export const pinDefinition = (op: string) => /^([^\s"';]+)\s+(IN_OUT|IN|OUT):(.+)$/.exec(op);

export function instructionFields(text: string) {
  const { tokens, note, diagnostic } = commandParts(text);
  if (diagnostic) return { op: '未解析', operands: [text], note, diagnostic };
  return {
    op: isFunctionCall(text) || pinDefinition(text) ? tokens.join(' ') : (tokens[0] ?? ''),
    operands: isFunctionCall(text) || pinDefinition(text) ? [] : tokens.slice(1),
    note,
  };
}

export function gxInstructions(rows: string[][], header: number): Instruction[] {
  const columns = requireValue(rows[header]),
    get = (row: string[], key: string) => row[columns.indexOf(key)]?.trim() ?? '';
  const instructions: Instruction[] = [],
    bodies = new Map<string, { text: string; sourceRow: number; endRow: number }>(),
    ambiguousBodies = new Set<string>();
  let statement = '',
    block: Instruction['block'],
    body: { number: string; lines: string[]; sourceRow: number } | undefined;
  const append = (old: string, text: string) => [old, text].filter(Boolean).join('\n');
  const unreadable = (sourceRow: number, raw: string[], diagnostic: string) => {
    const row = requireValue(rows[sourceRow - 1]);
    instructions.push({
      id: `row-${sourceRow}`,
      sourceRow,
      step: get(row, 'ステップ番号'),
      op: '未解析',
      operands: raw,
      statement,
      note: displayGxText(get(row, 'ノート')),
      diagnostic,
      block,
    });
    statement = '';
  };
  const unreadableBody = (sourceRow: number, endRow: number, diagnostic: string) =>
    unreadable(
      sourceRow,
      [
        rows
          .slice(sourceRow - 1, endRow)
          .map((fields) => fields.join('\t'))
          .join('\n'),
      ],
      diagnostic,
    );
  for (let index = header + 1; index < rows.length; index++) {
    const row = requireValue(rows[index]),
      sourceRow = index + 1,
      first = row[0]?.trim() ?? '';
    if (body) {
      if (first === `</STB${body.number}>`) {
        if (bodies.has(body.number)) {
          ambiguousBodies.add(body.number);
          unreadableBody(body.sourceRow, sourceRow, `STB${body.number}の本文が重複しています。`);
        } else
          bodies.set(body.number, {
            text: body.lines.join('\n'),
            sourceRow: body.sourceRow,
            endRow: sourceRow,
          });
        body = undefined;
        continue;
      } else if (/^<\/?STB\d+>$/.test(first)) {
        unreadableBody(body.sourceRow, sourceRow - 1, 'インラインSTの終端が対応していません。');
        body = undefined;
      } else {
        body.lines.push(row[0] ?? '');
        continue;
      }
    }
    const start = /^<STB([1-9]\d*)>$/.exec(first);
    if (start) {
      body = { number: requireValue(start[1]), lines: [], sourceRow };
      continue;
    }
    if (/^<\/STB\d+>$/.test(first)) {
      unreadable(sourceRow, [first], 'インラインSTの開始位置がありません。');
      continue;
    }
    const opText = get(row, '命令'),
      io = get(row, 'I/O(デバイス)'),
      rowStatement = get(row, '行間ステートメント');
    const marker = /^\*?;(FB|FUN) BLK (START|END)$/.exec(rowStatement || opText);
    if (marker) {
      if (marker[2] === 'START') {
        if (block)
          unreadable(sourceRow, [rowStatement || opText], 'FB/FUNの開始位置が重複しています。');
        block = { id: `block-${sourceRow}`, kind: marker[1] as 'FB' | 'FUN', closed: false };
      } else {
        if (!block || block.kind !== marker[1])
          unreadable(sourceRow, [rowStatement || opText], 'FB/FUNの開始と終了が対応していません。');
        else block.closed = true;
        block = undefined;
      }
      continue;
    }
    statement = append(statement, displayGxText(rowStatement));
    const pi = displayGxText(get(row, 'PIステートメント')),
      note = displayGxText(get(row, 'ノート'));
    const previous = instructions.at(-1);
    if (opText.startsWith(';') || opText.startsWith('*;')) {
      statement = append(statement, displayGxText(opText.replace(/^\*?;/, '')));
      continue;
    }
    if (opText.startsWith('[')) {
      if (!previous || !isPointerDefinition(previous.op)) {
        unreadable(sourceRow, [opText], 'PIステートメントに対応するポインターがありません。');
        continue;
      }
      previous.piStatement = append(
        previous.piStatement ?? '',
        displayGxText(opText.slice(1).replace(/\]$/, '')),
      );
      continue;
    }
    if (/^<(?![=>])/.test(opText)) {
      if (!previous) {
        unreadable(sourceRow, [opText], 'ノートに対応する命令がありません。');
        continue;
      }
      previous.note = append(previous.note, displayGxText(opText.slice(1).replace(/>$/, '')));
      continue;
    }
    const command = commandParts(opText),
      args = commandParts(io);
    const diagnostic = command.diagnostic ?? args.diagnostic;
    if (diagnostic) {
      unreadable(sourceRow, [opText, io].filter(Boolean), diagnostic);
      continue;
    }
    let current: Instruction | undefined;
    if (command.tokens.length) {
      const special = isFunctionCall(opText) || pinDefinition(opText);
      const op = special ? command.tokens.join(' ') : command.tokens[0];
      current = {
        id: `row-${sourceRow}`,
        sourceRow,
        step: get(row, 'ステップ番号'),
        op: requireValue(op),
        operands: [...(special ? [] : command.tokens.slice(1)), ...args.tokens],
        note: append(note, args.note),
        statement,
        block,
      };
      if (isPointerDefinition(requireValue(op))) current.piStatement = command.note;
      else current.note = append(current.note, command.note);
      instructions.push(current);
      statement = '';
    } else if (args.tokens.length || args.note || note) {
      if (!previous) {
        unreadable(sourceRow, [io], '命令のないオペランドです。');
        continue;
      }
      previous.operands.push(...args.tokens);
      previous.note = append(previous.note, append(note, args.note));
    }
    if (pi) {
      const pointer =
        current && isPointerDefinition(current.op)
          ? current
          : previous && isPointerDefinition(previous.op)
            ? previous
            : undefined;
      if (pointer) pointer.piStatement = append(pointer.piStatement ?? '', pi);
      else statement = append(statement, pi);
    }
  }
  if (body)
    unreadableBody(
      body.sourceRow,
      rows.length,
      `STB${body.number}の本文を閉じる終端がありません。`,
    );
  const owners = new Map<string, Instruction>();
  for (const instruction of instructions) {
    if (!/^STB[1-9]\d*$/.test(instruction.op)) continue;
    const number = instruction.op.slice(3);
    const source = bodies.get(number);
    const previous = owners.get(number);
    if (source && previous) {
      ambiguousBodies.add(number);
      previous.diagnostic = `STB${number}の本文に対応する命令が一意に決まりません。`;
      delete previous.inlineST;
    }
    if (ambiguousBodies.has(number))
      instruction.diagnostic = `STB${number}の本文を特定できません。`;
    owners.set(number, instruction);
    instruction.inlineST =
      source && !instruction.diagnostic
        ? { number: Number(number), text: source.text, sourceRow: source.sourceRow }
        : { number: Number(number), text: '', sourceRow: instruction.sourceRow, missing: true };
  }
  let appendedBody = false;
  for (const [number, source] of bodies) {
    if (!owners.has(number) || ambiguousBodies.has(number)) {
      unreadableBody(
        source.sourceRow,
        source.endRow,
        `STB${number}の本文に対応する命令を特定できません。`,
      );
      appendedBody = true;
    }
  }
  if (appendedBody) instructions.sort((a, b) => a.sourceRow - b.sourceRow);
  return instructions;
}
