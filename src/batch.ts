import Papa from 'papaparse';
import { isComparisonHeader, parseComparison } from './comparison';
import type { DeviceComments } from './comments';
import { decodeCsv, parseProgram, type Program } from './model';

export interface CsvInput { name: string; bytes: ArrayBuffer; }
export interface BatchResult { programs: Program[]; comments: string[]; deviceComments: DeviceComments; errors: { name: string; message: string }[]; }

export function parseCsvBatch(files: CsvInput[], progress?: (done: number, total: number, name: string) => void): BatchResult {
  const result: BatchResult = { programs: [], comments: [], deviceComments: Object.create(null), errors: [] };
  const ordered = [...files].sort((a, b) => a.name.localeCompare(b.name, 'ja', { numeric: true }));
  for (const [index, file] of ordered.entries()) {
    try {
      const text = decodeCsv(file.bytes);
      const headers = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { delimiter: '\t', preview: 10, skipEmptyLines: true }).data;
      if (headers.some(row => row[0] === 'デバイス名' && row.length > 1 && !row.includes('命令'))) {
        const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { delimiter: '\t', skipEmptyLines: true });
        if (parsed.errors.length) throw new Error(parsed.errors[0].message);
        const head = parsed.data.findIndex(row => row[0] === 'デバイス名');
        const japanese = parsed.data[head].findIndex(column => /Japanese|日本語/.test(column));
        const column = japanese > 0 ? japanese : 1;
        for (const row of parsed.data.slice(head + 1)) {
          const device = row[0]?.trim().toUpperCase(), comment = row[column]?.trim();
          if (device && comment) result.deviceComments[device] = comment;
        }
        result.comments.push(file.name);
      } else result.programs.push(headers.some(isComparisonHeader) ? parseComparison(text, file.name) : parseProgram(text, file.name));
    } catch (error) {
      result.errors.push({ name: file.name, message: error instanceof Error ? error.message : String(error) });
    }
    progress?.(index + 1, ordered.length, file.name);
  }
  return result;
}
