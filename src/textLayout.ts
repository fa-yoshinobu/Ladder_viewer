import { requireValue } from './requireValue';
const units = (c: string) => (c.charCodeAt(0) < 256 || /[\uFF61-\uFF9F]/.test(c) ? 1 : 2);
export function commentLines(text: string, maxUnits: number, limit = 2): string[] {
  const lines: string[] = [];
  let line = '',
    count = 0;
  for (const char of text.replace(/\r/g, '')) {
    if (char === '\n') {
      lines.push(line);
      line = '';
      count = 0;
      continue;
    }
    const width = units(char);
    if (count + width > maxUnits && line) {
      lines.push(line);
      line = '';
      count = 0;
    }
    line += char;
    count += width;
  }
  if (line) lines.push(line);
  if (lines.length <= limit) return lines;
  const result = lines.slice(0, limit);
  let last = requireValue(result[limit - 1]);
  while ([...last].reduce((sum, c) => sum + units(c), 0) > maxUnits - 2)
    last = [...last].slice(0, -1).join('');
  result[limit - 1] = last + '…';
  return result;
}
