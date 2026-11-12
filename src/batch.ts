import { csvRows } from './gxFormat';
import { detectCommentFormat } from './commentFormat';
import { programFormat } from './programFormat';
import { parseKeyenceMnm } from './keyence/parser';
import type { KeyenceProgram } from './keyence/model';
import { linkKeyenceMacros } from './keyence/macros';
import { parseKeyenceComments, type KeyenceDeviceComments } from './keyence/comments';
import { isComparisonHeader, parseComparison } from './comparison';
import type { DeviceComments } from './comments';
import { decodeCsv, parseProgram, type Program } from './model';

export interface CsvInput {
  name: string;
  bytes: ArrayBuffer;
  folder?: string;
  relativePath?: string;
}
export interface BatchResult {
  programs: Program[];
  keyencePrograms: KeyenceProgram[];
  comments: string[];
  commentsByProgram: Record<string, DeviceComments>;
  errors: { name: string; message: string }[];
}

export function parseCsvBatch(
  files: CsvInput[],
  progress?: (done: number, total: number, name: string) => void,
): BatchResult {
  const result: BatchResult = {
    programs: [],
    keyencePrograms: [],
    comments: [],
    commentsByProgram: Object.create(null),
    errors: [],
  };
  const folderOf = (file: CsvInput) =>
    file.folder ?? file.name.replaceAll('\\', '/').split('/').slice(0, -1).join('/').toLowerCase();
  const tables = new Map<string, DeviceComments>();
  const keyenceTables = new Map<string, KeyenceDeviceComments>();
  const programFolders = new Map<Program, string>();
  const keyenceFolders = new Map<string, KeyenceProgram[]>();
  const isNamedTable = (file: CsvInput) => /^comment\.csv$/i.test(file.name.split(/[\\/]/).at(-1)!);
  type Prepared =
    | { file: CsvInput; kind: 'keyence' }
    | { file: CsvInput; kind: 'keyence-comments'; comments: KeyenceDeviceComments }
    | { file: CsvInput; kind: 'mitsubishi-comments'; comments: DeviceComments }
    | { file: CsvInput; kind: 'mitsubishi'; text: string; comparison: boolean }
    | { file: CsvInput; kind: 'error'; message: string };
  const ordered = [...files].sort((a, b) => a.name.localeCompare(b.name, 'ja', { numeric: true }));
  // Classify comment tables before parsing programs, regardless of filename order.
  const prepared: Prepared[] = ordered.map<Prepared>((file) => {
    try {
      const format = programFormat(file.name);
      if (!format) throw new Error('対応形式は三菱CSV・キーエンスMNMです。');
      if (format === 'keyence') return { file, kind: 'keyence' };
      const text = decodeCsv(file.bytes);
      const commentFormat = detectCommentFormat(text);
      if (commentFormat === 'keyence')
        return { file, kind: 'keyence-comments', comments: parseKeyenceComments(file.bytes) };
      const headers = csvRows(text, 10).data;
      if (commentFormat === 'mitsubishi') {
        const parsed = csvRows(text);
        if (parsed.errors.length) throw new Error(parsed.errors[0].message);
        const head = parsed.data.findIndex(
          (row) =>
            row[0]?.trim() === 'デバイス名' &&
            row.length > 1 &&
            !row.some((value) => value.trim() === '命令'),
        );
        const japanese = parsed.data[head].findIndex((column) => /Japanese|日本語/.test(column));
        const column = japanese > 0 ? japanese : 1,
          comments: DeviceComments = Object.create(null);
        for (const row of parsed.data.slice(head + 1)) {
          const device = row[0]?.trim().toUpperCase(),
            comment = row[column]?.trim();
          if (device && comment) comments[device] = comment;
        }
        return { file, kind: 'mitsubishi-comments', comments };
      }
      return { file, kind: 'mitsubishi', text, comparison: headers.some(isComparisonHeader) };
    } catch (error) {
      return {
        file,
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });
  const namedTables = new Set(
    prepared
      .filter((item) => item.kind === 'mitsubishi-comments' && isNamedTable(item.file))
      .map((item) => folderOf(item.file)),
  );
  const namedKeyenceTables = new Set(
    prepared
      .filter((item) => item.kind === 'keyence-comments' && isNamedTable(item.file))
      .map((item) => folderOf(item.file)),
  );
  for (const item of prepared) {
    const folder = folderOf(item.file);
    if (item.kind === 'keyence-comments') {
      if (namedKeyenceTables.has(folder) && !isNamedTable(item.file)) continue;
      keyenceTables.set(
        folder,
        Object.assign(keyenceTables.get(folder) ?? Object.create(null), item.comments),
      );
    } else if (item.kind === 'mitsubishi-comments') {
      if (namedTables.has(folder) && !isNamedTable(item.file)) continue;
      tables.set(folder, Object.assign(tables.get(folder) ?? Object.create(null), item.comments));
    }
  }
  for (const [index, item] of prepared.entries()) {
    const { file } = item;
    try {
      if (item.kind === 'error') throw new Error(item.message);
      if (item.kind === 'keyence') {
        const folder = folderOf(file),
          program = parseKeyenceMnm(file.bytes, file.name, keyenceTables.get(folder));
        if (file.relativePath !== undefined) program.relativePath = file.relativePath;
        result.keyencePrograms.push(program);
        const programs = keyenceFolders.get(folder) ?? [];
        programs.push(program);
        keyenceFolders.set(folder, programs);
      } else if (item.kind === 'keyence-comments' || item.kind === 'mitsubishi-comments')
        result.comments.push(file.name);
      else {
        const program = item.comparison
          ? parseComparison(item.text, file.name)
          : parseProgram(item.text, file.name);
        if (file.relativePath !== undefined) program.relativePath = file.relativePath;
        result.programs.push(program);
        programFolders.set(program, folderOf(file));
      }
    } catch (error) {
      result.errors.push({
        name: file.name,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    progress?.(index + 1, ordered.length, file.name);
  }
  for (const program of result.programs)
    result.commentsByProgram[program.name] =
      tables.get(programFolders.get(program)!) ?? Object.create(null);
  for (const programs of keyenceFolders.values()) linkKeyenceMacros(programs);
  return result;
}
