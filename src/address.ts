export interface AddressPart {
  text: string;
  index: boolean;
}

// Match device/constant operands, not quoted strings or named labels containing Z.
const address =
  /^(?:K\d+)?(?:STN|STC|STS|SM|SD|DX|DY|ZR|LZ|TN|TC|TS|CN|CC|CS|[XYMLFVBWDRSTCZUJGKH])[0-9A-F]+(?:(?:LZ|Z)\d+)?(?:\\(?:STN|STC|STS|SM|SD|DX|DY|ZR|LZ|TN|TC|TS|CN|CC|CS|[XYMLFVBWDRSTCZUJGKH])[0-9A-F]+(?:(?:LZ|Z)\d+)?)*(?:\.[0-9A-F]+)?$/i;
export function addressParts(text: string): AddressPart[] {
  if (!address.test(text)) return [{ text, index: false }];
  const parts: AddressPart[] = [];
  let cursor = 0;
  for (const match of text.matchAll(/(?:LZ|Z)\d+/gi)) {
    if (match.index! > cursor) parts.push({ text: text.slice(cursor, match.index), index: false });
    parts.push({ text: match[0], index: true });
    cursor = match.index! + match[0].length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), index: false });
  return parts;
}
