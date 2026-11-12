import Papa from 'papaparse';

export type CommentFormat = 'mitsubishi' | 'keyence';

// Keep this rule in sync with docs/INPUT_FORMAT.md and the shared fixtures.
export function detectCommentFormat(text: string): CommentFormat | undefined {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r\n?|\n/)
    .filter((line) => line.trim())
    .slice(0, 10);
  for (const [index, line] of lines.entries()) {
    for (const delimiter of ['\t', ',']) {
      const parsed = Papa.parse<string[]>(line, { delimiter });
      if (parsed.errors.length) continue;
      const row = parsed.data[0]?.map((value) => value.trim()) ?? [];
      if (
        index === 0 &&
        delimiter === ',' &&
        row[0] === '' &&
        row[1] === '' &&
        row[2] === 'コメント1'
      )
        return 'keyence';
      if (row.length > 1 && row[0] === 'デバイス名' && !row.includes('命令')) return 'mitsubishi';
    }
  }
  return undefined;
}
