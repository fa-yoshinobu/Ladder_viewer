// Encoding rules and cross-language fixtures: docs/INPUT_FORMAT.md.
export function decodePlcText(bytes: ArrayBuffer): string {
  const data = new Uint8Array(bytes);
  const encoding =
    data[0] === 0xff && data[1] === 0xfe
      ? 'utf-16le'
      : data[0] === 0xfe && data[1] === 0xff
        ? 'utf-16be'
        : data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf
          ? 'utf-8'
          : undefined;
  if (encoding) return new TextDecoder(encoding, { fatal: true }).decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('shift_jis', { fatal: true }).decode(bytes);
  }
}
