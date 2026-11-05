import type { CsvInput } from './batch';

export interface NativeCsvSelection {
  type: 'csv-selection';
  token: number;
  status: 'ok' | 'cancelled' | 'error' | 'loading';
  files?: { name: string; base64: string; folder?: string;relativePath?:string }[];
  comparison?:{source:NativeCsvSelection['files'];target:NativeCsvSelection['files'];sourceWarnings?:string[];targetWarnings?:string[]};
  warnings?: string[];
  error?: string;
}

export interface NativeCsvBridge {
  postMessageWithAdditionalObjects?(message:{type:'read-dropped';token:number},files:File[]):void;
  postMessage(message: { type: 'open-csv' | 'open-folder' | 'open-startup'; token: number } | { type: 'instruction-menu'; text: string } | { type: 'show-about'; dark?: boolean }): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<NativeCsvSelection>) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent<NativeCsvSelection>) => void): void;
}

export function nativeCsvBridge(): NativeCsvBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { chrome?: { webview?: NativeCsvBridge } }).chrome?.webview;
}

export function decodeNativeCsvFiles(files: NativeCsvSelection['files']): CsvInput[] {
  if (!Array.isArray(files) || !files.length) throw new Error('読み込むファイルがありません。');
  return files.map(file => {
    if (!file || typeof file.name !== 'string' || !file.name.trim() || typeof file.base64 !== 'string' || (file.folder !== undefined && typeof file.folder !== 'string') || (file.relativePath !== undefined && typeof file.relativePath !== 'string')) {
      throw new Error('ファイルの受信データが不正です。');
    }
    let binary: string;
    try {
      binary = atob(file.base64);
      if (btoa(binary) !== file.base64) throw new Error();
    } catch {
      throw new Error(file.name + ': ファイルのBase64データが不正です。');
    }
    return { name: file.name, folder: file.folder,...(file.relativePath!==undefined?{relativePath:file.relativePath}:{}), bytes: Uint8Array.from(binary, value => value.charCodeAt(0)).buffer };
  });
}
