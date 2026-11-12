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
export function commandParts(text: string): { tokens: string[]; note: string } {
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
  if (quote) throw new Error('文字列定数の引用符が閉じていません。');
  if (token) tokens.push(token);
  return { tokens, note: '' };
}
export const isFunctionCall = (op: string) => /^(?:FBCALL|FUNCALL)\s+/.test(op);
export const pinDefinition = (op: string) => /^([^\s"';]+)\s+(IN_OUT|IN|OUT):(.+)$/.exec(op);

export function instructionFields(text: string) {
  const { tokens, note } = commandParts(text);
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
    bodies = new Map<string, { text: string; sourceRow: number }>();
  let statement = '',
    block: Instruction['block'],
    body: { number: string; lines: string[]; sourceRow: number } | undefined;
  const append = (old: string, text: string) => [old, text].filter(Boolean).join('\n');
  for (let index = header + 1; index < rows.length; index++) {
    const row = requireValue(rows[index]),
      sourceRow = index + 1,
      first = row[0]?.trim() ?? '';
    if (body) {
      if (first === `</STB${body.number}>`) {
        if (bodies.has(body.number))
          throw new Error(`CSV ${sourceRow}行: STB${body.number}の本文が重複しています。`);
        bodies.set(body.number, { text: body.lines.join('\n'), sourceRow: body.sourceRow });
        body = undefined;
      } else {
        if (/^<\/?STB\d+>$/.test(first))
          throw new Error(`CSV ${sourceRow}行: インラインSTの終端が対応していません。`);
        body.lines.push(row[0] ?? '');
      }
      continue;
    }
    const start = /^<STB([1-9]\d*)>$/.exec(first);
    if (start) {
      body = { number: requireValue(start[1]), lines: [], sourceRow };
      continue;
    }
    if (/^<\/STB\d+>$/.test(first))
      throw new Error(`CSV ${sourceRow}行: インラインSTの開始位置がありません。`);
    const opText = get(row, '命令'),
      io = get(row, 'I/O(デバイス)'),
      rowStatement = get(row, '行間ステートメント');
    const marker = /^\*?;(FB|FUN) BLK (START|END)$/.exec(rowStatement || opText);
    if (marker) {
      if (marker[2] === 'START') {
        if (block) throw new Error(`CSV ${sourceRow}行: FB/FUNの開始位置が重複しています。`);
        block = { id: `block-${sourceRow}`, kind: marker[1] as 'FB' | 'FUN', closed: false };
      } else {
        if (!block || block.kind !== marker[1])
          throw new Error(`CSV ${sourceRow}行: FB/FUNの開始と終了が対応していません。`);
        block.closed = true;
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
      if (!previous || !isPointerDefinition(previous.op))
        throw new Error(`CSV ${sourceRow}行: PIステートメントに対応するポインターがありません。`);
      previous.piStatement = append(
        previous.piStatement ?? '',
        displayGxText(opText.slice(1).replace(/\]$/, '')),
      );
      continue;
    }
    if (/^<(?![=>])/.test(opText)) {
      if (!previous) throw new Error(`CSV ${sourceRow}行: ノートに対応する命令がありません。`);
      previous.note = append(previous.note, displayGxText(opText.slice(1).replace(/>$/, '')));
      continue;
    }
    const command = commandParts(opText),
      args = commandParts(io);
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
      if (!previous) throw new Error(`CSV ${sourceRow}行: 命令のないオペランドです。`);
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
  if (body) throw new Error(`STB${body.number}の本文を閉じる終端がありません。`);
  for (const [number, source] of bodies) {
    const owners = instructions.filter((i) => i.op === `STB${number}`);
    if (owners.length !== 1)
      throw new Error(`STB${number}の本文に対応する命令が一意に決まりません。`);
    requireValue(owners[0]).inlineST = { number: Number(number), ...source };
  }
  for (const instruction of instructions) {
    if (/^STB[1-9]\d*$/.test(instruction.op) && !instruction.inlineST)
      instruction.inlineST = {
        number: Number(instruction.op.slice(3)),
        text: '',
        sourceRow: instruction.sourceRow,
        missing: true,
      };
  }
  return instructions;
}
