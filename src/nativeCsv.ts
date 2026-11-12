import type { CsvInput } from './batch';
import type { CommentListRequest } from './commentListData';

export interface NativeCsvSelection {
  type: 'csv-selection';
  token: number;
  status: 'ok' | 'cancelled' | 'error' | 'loading';
  files?: { name: string; base64: string; folder?: string; relativePath?: string }[];
  comparison?: {
    source: NativeCsvSelection['files'];
    target: NativeCsvSelection['files'];
    sourceWarnings?: string[];
    targetWarnings?: string[];
  };
  warnings?: string[];
  error?: string;
}

export interface NativeCsvBridge {
  postMessageWithAdditionalObjects?(
    message: { type: 'read-dropped'; token: number },
    files: File[],
  ): void;
  postMessage(
    message:
      | { type: 'open-csv' | 'open-folder' | 'open-startup'; token: number }
      | { type: 'instruction-menu'; text: string; commentList?: CommentListRequest }
      | { type: 'show-comment-list'; commentList: CommentListRequest }
      | { type: 'show-about'; dark?: boolean },
  ): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<NativeCsvSelection>) => void,
  ): void;
  removeEventListener(
    type: 'message',
    listener: (event: MessageEvent<NativeCsvSelection>) => void,
  ): void;
}

export function nativeCsvBridge(): NativeCsvBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { chrome?: { webview?: NativeCsvBridge } }).chrome?.webview;
}

export function decodeNativeCsvFiles(files: NativeCsvSelection['files']): CsvInput[] {
  if (!Array.isArray(files) || !files.length) throw new Error('読み込むファイルがありません。');
  return files.map((file) => {
    if (
      !file ||
      typeof file.name !== 'string' ||
      !file.name.trim() ||
      typeof file.base64 !== 'string' ||
      (file.folder !== undefined && typeof file.folder !== 'string') ||
      (file.relativePath !== undefined && typeof file.relativePath !== 'string')
    ) {
      throw new Error('ファイルの受信データが不正です。');
    }
    let binary: string;
    try {
      const encoded = file.base64;
      if (encoded.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(encoded)) throw new Error();
      const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
      const contentLength = encoded.length - padding;
      if (encoded.slice(0, contentLength).includes('=')) throw new Error();
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      const tail = alphabet.indexOf(encoded.charAt(contentLength - 1));
      if ((padding === 2 && (tail & 15) !== 0) || (padding === 1 && (tail & 3) !== 0))
        throw new Error();
      binary = atob(file.base64);
    } catch {
      throw new Error(file.name + ': ファイルのBase64データが不正です。');
    }
    return {
      name: file.name,
      folder: file.folder,
      ...(file.relativePath !== undefined ? { relativePath: file.relativePath } : {}),
      bytes: Uint8Array.from(binary, (value) => value.charCodeAt(0)).buffer,
    };
  });
}
