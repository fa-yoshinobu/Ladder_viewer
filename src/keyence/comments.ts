import { requireValue } from '../requireValue';
import Papa from 'papaparse';
import { decodeKeyenceText } from './encoding';
import { detectCommentFormat } from '../commentFormat';

export type KeyenceDeviceComments = Record<string, string>;
export function keyenceCommentAddress(address: string): string {
  const key = address.trim().toUpperCase();
  const match =
    /^((?:B|W))([0-9A-F]+)$/.exec(key) ?? /^(MR|LR|CR|DM|EM|FM|CM|TM|R|T|C)([0-9]+)$/.exec(key);
  return match ? match[1] + requireValue(match[2]).replace(/^0+(?=.)/, '') : key;
}
function rows(bytes: ArrayBuffer): string[][] {
  const result = Papa.parse<string[]>(decodeKeyenceText(bytes), {
    delimiter: ',',
    skipEmptyLines: 'greedy',
  });
  if (result.errors.length) throw new Error('キーエンスのコメントCSVを読み込めません。');
  return result.data;
}
function isHeader(row: string[] | undefined): boolean {
  return !!row && row[0]?.trim() === '' && row[1]?.trim() === '' && row[2]?.trim() === 'コメント1';
}
export function isKeyenceCommentCsv(bytes: ArrayBuffer): boolean {
  try {
    return detectCommentFormat(decodeKeyenceText(bytes)) === 'keyence';
  } catch {
    return false;
  }
}
export function parseKeyenceComments(bytes: ArrayBuffer): KeyenceDeviceComments {
  const data = rows(bytes);
  if (!isHeader(data[0])) throw new Error('キーエンスのコメントCSVヘッダーがありません。');
  const comments: KeyenceDeviceComments = Object.create(null);
  for (const row of data.slice(1)) {
    const address = row[0]?.trim(),
      comment = row[2]?.trim();
    if (address && comment) comments[keyenceCommentAddress(address)] = comment;
  }
  return comments;
}
export function keyenceDeviceComment(address: string, comments: KeyenceDeviceComments): string {
  const exact = address.trim().toUpperCase();
  if (Object.hasOwn(comments, exact)) return requireValue(comments[exact]);
  const key = keyenceCommentAddress(exact);
  return Object.hasOwn(comments, key) ? requireValue(comments[key]) : '';
}
