import { requireValue } from './requireValue';
export type StTokenKind =
  'plain' | 'keyword' | 'type' | 'number' | 'string' | 'comment' | 'function';
export interface StToken {
  start: number;
  end: number;
  kind: StTokenKind;
}
const keywords = new Set(
  (
    'IF THEN ELSIF ELSE END_IF CASE OF END_CASE FOR TO BY DO END_FOR WHILE END_WHILE REPEAT UNTIL END_REPEAT EXIT CONTINUE RETURN ' +
    'VAR VAR_INPUT VAR_OUTPUT VAR_IN_OUT VAR_TEMP VAR_GLOBAL VAR_EXTERNAL VAR_CONSTANT END_VAR CONSTANT RETAIN NON_RETAIN AT ' +
    'PROGRAM END_PROGRAM FUNCTION END_FUNCTION FUNCTION_BLOCK END_FUNCTION_BLOCK TYPE END_TYPE STRUCT END_STRUCT ARRAY ' +
    'AND OR XOR NOT MOD TRUE FALSE'
  ).split(' '),
);
const types = new Set(
  'BOOL BYTE WORD DWORD LWORD SINT INT DINT LINT USINT UINT UDINT ULINT REAL LREAL TIME LTIME DATE LDATE TIME_OF_DAY TOD LTOD DATE_AND_TIME DT LDT STRING WSTRING CHAR WCHAR'.split(
    ' ',
  ),
);
const word = /[\p{L}_][\p{L}\p{N}_]*/uy;
const number =
  /(?:(?:TIME|LTIME|T|LT|DATE|LDATE|D|LD|TIME_OF_DAY|TOD|LTOD|DATE_AND_TIME|DT|LDT)#[+-]?[\d][\w.:+-]*|(?:[A-Z_]\w*#)?(?:16#[\dA-F_]+|8#[0-7_]+|2#[01_]+|(?:\d[\d_]*(?:\.(?!\.)[\d_]+)?|\.\d[\d_]*)(?:E[+-]?\d[\d_]*)?)|BOOL#(?:TRUE|FALSE)|#[+-]?\d[\d_]*|\$[\dA-F]+)/iy;

// Display-only lexer. It never changes source text or validates PLC semantics.
export function stTokens(text: string): StToken[] {
  const tokens: StToken[] = [];
  let pos = 0;
  while (pos < text.length) {
    const start = pos;
    let kind: StTokenKind = 'plain';
    if (text.startsWith('//', pos)) {
      kind = 'comment';
      pos = text.indexOf('\n', pos);
      if (pos < 0) pos = text.length;
    } else if (text.startsWith('(*', pos) || text.startsWith('/*', pos)) {
      kind = 'comment';
      const ends = [text[pos] === '(' ? '*)' : '*/'];
      pos += 2;
      while (pos < text.length && ends.length) {
        if (text.startsWith(ends.at(-1)!, pos)) {
          ends.pop();
          pos += 2;
        } else if (text.startsWith('(*', pos) || text.startsWith('/*', pos)) {
          ends.push(text[pos] === '(' ? '*)' : '*/');
          pos += 2;
        } else pos++;
      }
    } else if (text[pos] === "'" || text[pos] === '"') {
      kind = 'string';
      const quote = text[pos++];
      while (pos < text.length) {
        if (text[pos] === '$') {
          pos = Math.min(text.length, pos + 2);
          continue;
        }
        if (text[pos++] === quote) {
          if (text[pos] === quote) {
            pos++;
            continue;
          }
          break;
        }
      }
    } else {
      number.lastIndex = pos;
      word.lastIndex = pos;
      const numeric = number.exec(text);
      if (numeric) {
        kind = 'number';
        pos += numeric[0].length;
      } else {
        const identifier = word.exec(text);
        if (identifier) {
          pos += identifier[0].length;
          const upper = identifier[0].toUpperCase();
          kind = keywords.has(upper)
            ? 'keyword'
            : types.has(upper)
              ? 'type'
              : /^\s*\(/.test(text.slice(pos))
                ? 'function'
                : 'plain';
        } else pos++;
      }
    }
    const previous = tokens.at(-1);
    if (previous?.kind === kind) previous.end = pos;
    else tokens.push({ start, end: pos, kind });
  }
  return tokens;
}

export function highlightStRows(
  rows: readonly { text: string; continuation: boolean }[],
): { text: string; kind: StTokenKind }[][] {
  let source = '';
  const offsets: number[] = [];
  for (const row of rows) {
    if (offsets.length && !row.continuation) source += '\n';
    offsets.push(source.length);
    source += row.text;
  }
  const tokens = stTokens(source);
  let tokenIndex = 0;
  return rows.map((row, index) => {
    const start = requireValue(offsets[index]),
      end = start + row.text.length,
      parts: { text: string; kind: StTokenKind }[] = [];
    if (start === end) return parts;
    while (tokenIndex < tokens.length && requireValue(tokens[tokenIndex]).end <= start)
      tokenIndex++;
    for (let n = tokenIndex; n < tokens.length && requireValue(tokens[n]).start < end; n++) {
      const token = requireValue(tokens[n]);
      parts.push({
        text: source.slice(Math.max(start, token.start), Math.min(end, token.end)),
        kind: token.kind,
      });
    }
    return parts;
  });
}
