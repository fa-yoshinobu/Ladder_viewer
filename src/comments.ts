import { addressParts } from './address';
export type DeviceComments = Record<string, string>;
export function deviceComment(operand: string | undefined, comments: DeviceComments): string {
  if (!operand) return '';
  const key = operand.trim().toUpperCase();
  if (Object.hasOwn(comments, key)) return comments[key];
  const base = addressParts(key).filter(part => !part.index).map(part => part.text).join('');
  return Object.hasOwn(comments, base) ? comments[base] : '';
}
const units = (c: string) => c.charCodeAt(0) < 256 || /[\uFF61-\uFF9F]/.test(c) ? 1 : 2;
export function commentLines(text: string, maxUnits: number, limit = 2): string[] {
  const lines: string[] = [];
  let line = '', count = 0;
  for (const char of text.replace(/\r/g, '')) {
    if (char === '\n') { lines.push(line); line = ''; count = 0; continue; }
    const width = units(char);
    if (count + width > maxUnits && line) { lines.push(line); line = ''; count = 0; }
    line += char; count += width;
  }
  if (line) lines.push(line);
  if (lines.length <= limit) return lines;
  const result = lines.slice(0, limit);
  let last = result[limit - 1];
  while ([...last].reduce((sum, c) => sum + units(c), 0) > maxUnits - 2) last = [...last].slice(0, -1).join('');
  result[limit - 1] = last + '…';
  return result;
}
