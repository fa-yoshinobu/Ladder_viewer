import { addressParts } from './address';
import type { DeviceComments } from './comments';
import { keyenceCommentAddress } from './keyence/comments';
import type { KeyenceProgram } from './keyence/model';
import type { Program } from './model';

export interface CommentListEntry {
  address: string;
  comment: string;
}
export interface CommentListData {
  title: string;
  manufacturer: 'mitsubishi' | 'keyence';
  entries: CommentListEntry[];
}
export interface CommentListRequest extends CommentListData {
  selectedAddress: string;
  dark: boolean;
}
const deviceParts = {
  mitsubishi:
    /^(STN|STC|STS|SM|SD|DX|DY|ZR|LZ|TN|TC|TS|CN|CC|CS|[XYMLFVBWDRSTCZUJG])([0-9A-F]+)(?:\.([0-9A-F]+))?$/,
  keyence: /^(MR|LR|CR|DM|EM|FM|CM|TM|R|T|C|B|W)([0-9A-F]+)(?:\.(\d+))?$/,
};
function compareAddresses(
  a: string,
  b: string,
  manufacturer: CommentListData['manufacturer'],
): number {
  const left = deviceParts[manufacturer].exec(a),
    right = deviceParts[manufacturer].exec(b);
  if (left && right && left[1] === right[1]) {
    const radix = (manufacturer === 'mitsubishi' ? /^(X|Y|DX|DY|B|W)$/ : /^(B|W)$/).test(left[1])
      ? 16
      : 10;
    const result =
      parseInt(left[2], radix) - parseInt(right[2], radix) ||
      parseInt(left[3] ?? '0', 16) - parseInt(right[3] ?? '0', 16);
    if (Number.isFinite(result) && result) return result;
  }
  return a.localeCompare(b, 'ja', { numeric: true });
}
export function commentListAddress(
  value: string,
  manufacturer: CommentListData['manufacturer'],
): string {
  let address = value.trim().toUpperCase();
  if (manufacturer === 'keyence')
    return /^@?(?:(?:MR|LR|CR|DM|EM|FM|CM|TM|R|T|C)\d+|(?:B|W)[0-9A-F]+)(?:\.\d+)?$/.test(address)
      ? keyenceCommentAddress(address.replace(/^@/, ''))
      : '';
  address = address.replace(/^K\d+(?=[A-Z])/, '');
  address =
    addressParts(address)
      .filter((part) => !part.index)
      .map((part) => part.text)
      .join('') || address;
  return /^(?:STN|STC|STS|SM|SD|DX|DY|ZR|LZ|TN|TC|TS|CN|CC|CS|[XYMLFVBWDRSTCZUJG])[0-9A-F]+(?:\.[0-9A-F]+)?$/.test(
    address,
  )
    ? address
    : '';
}
function entries(
  table: DeviceComments,
  operands: string[][],
  manufacturer: CommentListData['manufacturer'],
  inline: { address: string; comment: string }[] = [],
): CommentListEntry[] {
  const rows = new Map<string, Set<string>>();
  const add = (raw: string, comment: string) => {
    const address = commentListAddress(raw, manufacturer) || raw.trim().toUpperCase();
    if (!address) return;
    const values = rows.get(address) ?? new Set<string>();
    if (comment.trim()) values.add(comment);
    rows.set(address, values);
  };
  for (const [address, comment] of Object.entries(table)) add(address, comment);
  for (const values of operands)
    for (const operand of values) {
      const address = commentListAddress(operand, manufacturer);
      if (address && !rows.has(address)) add(address, '');
    }
  for (const entry of inline) add(entry.address, entry.comment);
  return [...rows]
    .sort(([a], [b]) => compareAddresses(a, b, manufacturer))
    .flatMap(([address, values]) =>
      (values.size ? [...values] : ['']).map((comment) => ({ address, comment })),
    );
}
export function mitsubishiCommentList(
  program: Program,
  comments: DeviceComments,
  title = program.name,
): CommentListData {
  return {
    title,
    manufacturer: 'mitsubishi',
    entries: entries(
      comments,
      program.instructions.map((i) => i.operands),
      'mitsubishi',
    ),
  };
}
export function keyenceCommentList(program: KeyenceProgram, title = program.name): CommentListData {
  const inline = program.instructions
    .filter(
      (i) => i.operands.length === 1 && i.comment && commentListAddress(i.operands[0], 'keyence'),
    )
    .map((i) => ({ address: i.operands[0], comment: i.comment }));
  return {
    title,
    manufacturer: 'keyence',
    entries: entries(
      program.deviceComments,
      program.instructions.map((i) => i.operands),
      'keyence',
      inline,
    ),
  };
}
export function commentListRequest(
  data: CommentListData | undefined,
  operands: string[] = [],
  dark = false,
): CommentListRequest | undefined {
  if (!data) return undefined;
  const selectedAddress =
    operands
      .map(
        (value) =>
          data.entries.find((e) => e.address === value.trim().toUpperCase())?.address ||
          commentListAddress(value, data.manufacturer),
      )
      .find(Boolean) || '';
  return { ...data, selectedAddress, dark };
}
export const commentListTsv = (rows: CommentListEntry[]) =>
  rows
    .map((row) =>
      [row.address, row.comment]
        .map((value) => (/[\t\r\n"]/.test(value) ? '"' + value.replaceAll('"', '""') + '"' : value))
        .join('\t'),
    )
    .join('\r\n');
