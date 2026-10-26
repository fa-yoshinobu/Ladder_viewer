import Papa from 'papaparse';
import { isComparisonHeader, parseComparison } from './comparison';
import type { DeviceComments } from './comments';
import { decodeCsv, parseProgram, type Program } from './model';

export interface CsvInput { name: string; bytes: ArrayBuffer; folder?: string; }
export interface BatchResult { programs: Program[]; comments: string[]; commentsByProgram: Record<string, DeviceComments>; errors: { name: string; message: string }[]; }

export function parseCsvBatch(files: CsvInput[], progress?: (done: number, total: number, name: string) => void): BatchResult {
  const result: BatchResult = { programs: [], comments: [], commentsByProgram: Object.create(null), errors: [] };
  const folderOf = (file: CsvInput) => file.folder ?? file.name.replaceAll('\\', '/').split('/').slice(0, -1).join('/').toLowerCase();
  const tables = new Map<string, DeviceComments>();
  const programFolders = new Map<Program, string>();
  const namedTables = new Set(files.filter(file => /^comment\.csv$/i.test(file.name.split(/[\\/]/).at(-1)!)).map(folderOf));
  const ordered = [...files].sort((a, b) => a.name.localeCompare(b.name, 'ja', { numeric: true }));
  for (const [index, file] of ordered.entries()) {
    try {
      const text = decodeCsv(file.bytes);
      const headers = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { delimiter: '\t', preview: 10, skipEmptyLines: true }).data;
      if (headers.some(row => row[0] === 'デバイス名' && row.length > 1 && !row.includes('命令'))) {
        const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { delimiter: '\t', skipEmptyLines: true });
        if (parsed.errors.length) throw new Error(parsed.errors[0].message);
        result.comments.push(file.name);
        if (namedTables.has(folderOf(file)) && !/^comment\.csv$/i.test(file.name.split(/[\\/]/).at(-1)!)) {
          progress?.(index + 1, ordered.length, file.name);
          continue;
        }
        const comments = tables.get(folderOf(file)) ?? Object.create(null) as DeviceComments;
        tables.set(folderOf(file), comments);
        const head = parsed.data.findIndex(row => row[0] === 'デバイス名');
        const japanese = parsed.data[head].findIndex(column => /Japanese|日本語/.test(column));
        const column = japanese > 0 ? japanese : 1;
        for (const row of parsed.data.slice(head + 1)) {
          const device = row[0]?.trim().toUpperCase(), comment = row[column]?.trim();
          if (device && comment) comments[device] = comment;
        }
      } else {
        const program = headers.some(isComparisonHeader) ? parseComparison(text, file.name) : parseProgram(text, file.name);
        result.programs.push(program);
        programFolders.set(program, folderOf(file));
      }
    } catch (error) {
      result.errors.push({ name: file.name, message: error instanceof Error ? error.message : String(error) });
    }
    progress?.(index + 1, ordered.length, file.name);
  }
  for (const program of result.programs) result.commentsByProgram[program.name] = tables.get(programFolders.get(program)!) ?? Object.create(null);
  return result;
}
