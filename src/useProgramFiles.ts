import { useEffect, useRef, useState } from 'preact/hooks';
import type { BatchResult, CsvInput } from './batch';
import { type DeviceComments } from './comments';
import type { KeyenceProgram } from './keyence/model';
import { type Program } from './model';
import { decodeNativeCsvFiles, nativeCsvBridge, type NativeCsvSelection } from './nativeCsv';
import { programFormat } from './programFormat';
const worker = new Worker(new URL('./parser.worker.ts', import.meta.url), { type: 'module' });
export function useProgramFiles({
  showProgram,
  showKeyenceProgram,
  onComparison,
}: {
  showProgram: (program: Program) => void;
  showKeyenceProgram: (program: KeyenceProgram) => void;
  onComparison: (selection: NonNullable<NativeCsvSelection['comparison']>) => void;
}) {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [keyencePrograms, setKeyencePrograms] = useState<KeyenceProgram[]>([]);
  const [commentsByProgram, setCommentsByProgram] = useState<Record<string, DeviceComments>>({});
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const token = useRef(0);
  const inputWarnings = useRef<string[]>([]);
  const nativeCsv = nativeCsvBridge();
  useEffect(() => {
    worker.onmessage = (
      e: MessageEvent<{ token: number; result?: BatchResult; progress?: string; error?: string }>,
    ) => {
      if (e.data.token !== token.current) return;
      if (e.data.progress) {
        setProgress(e.data.progress);
        return;
      }
      setBusy(false);
      setProgress('');
      if (e.data.error) {
        setError(e.data.error);
        return;
      }
      const result = e.data.result!;
      const failures = [
        ...inputWarnings.current,
        ...result.errors.map((item) => `${item.name}: ${item.message}`),
      ];
      if (!result.programs.length && !result.keyencePrograms.length) {
        setError(
          failures.join('\n') ||
            'プログラムファイルがありません。コメントCSVはプログラム切替の対象外です。',
        );
        return;
      }
      setPrograms(result.programs);
      setKeyencePrograms(result.keyencePrograms);
      setCommentsByProgram(result.commentsByProgram);
      setError(failures.join('\n'));

      if (result.programs.length) showProgram(result.programs[0]);
      else
        showKeyenceProgram(
          result.keyencePrograms.find((p) => /^Main$/i.test(p.moduleName)) ??
            result.keyencePrograms[0],
        );
    };
    worker.onerror = () => {
      setBusy(false);
      setProgress('');
      setError('解析処理でエラーが発生しました。再読み込みしてください。');
    };
    const onNativeCsv = (event: MessageEvent<NativeCsvSelection>) => {
      const message = event.data;
      if (message?.type !== 'csv-selection' || message.token !== token.current) return;
      if (message.status === 'loading') {
        setBusy(true);
        setProgress('ファイルを読み込んでいます…');
        return;
      }
      if (message.status === 'cancelled') {
        setBusy(false);
        setProgress('');
        return;
      }
      if (message.status === 'error') {
        setBusy(false);
        setProgress('');
        setError(message.error || 'ファイルを読み込めませんでした。');
        return;
      }
      if (message.comparison) {
        onComparison(message.comparison);
        setBusy(false);
        setProgress('');
        return;
      }
      try {
        const inputs = decodeNativeCsvFiles(message.files);
        inputWarnings.current = message.warnings ?? [];
        setBusy(true);
        setProgress('ファイルを読み込んでいます…');
        submitFiles(inputs, message.token);
      } catch (error) {
        setBusy(false);
        setProgress('');
        setError(error instanceof Error ? error.message : String(error));
      }
    };
    nativeCsv?.addEventListener('message', onNativeCsv);
    try {
      nativeCsv?.postMessage({ type: 'open-startup', token: token.current });
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
    return () => {
      nativeCsv?.removeEventListener('message', onNativeCsv);
    };
  }, []);
  function startLoad(progress = 'ファイルを読み込んでいます…') {
    const request = ++token.current;
    inputWarnings.current = [];
    setBusy(true);
    setProgress(progress);
    setError('');
    return request;
  }
  function submitFiles(inputs: CsvInput[], request: number) {
    if (request !== token.current) return;
    worker.postMessage(
      { files: inputs, token: request },
      inputs.map((input) => input.bytes),
    );
  }
  function openSelection(type: 'open-csv' | 'open-folder') {
    if (!nativeCsv) {
      setError('ファイル選択を開始できませんでした。アプリを起動し直してください。');
      return;
    }
    const request = startLoad(
      type === 'open-folder' ? 'フォルダーを選択しています…' : 'ファイルを選択しています…',
    );
    try {
      nativeCsv.postMessage({ type, token: request });
    } catch (error) {
      setBusy(false);
      setProgress('');
      setError(error instanceof Error ? error.message : String(error));
    }
  }
  async function load(files: File[]) {
    const request = startLoad();
    try {
      if (nativeCsv?.postMessageWithAdditionalObjects) {
        nativeCsv.postMessageWithAdditionalObjects({ type: 'read-dropped', token: request }, files);
        return;
      }
      const csvFiles = files.filter((file) => programFormat(file.name) !== undefined);
      if (!csvFiles.length)
        throw new Error(
          'CSV/MNMがありません。フォルダーは「フォルダーを開く」で選択してください。',
        );
      const inputs: CsvInput[] = await Promise.all(
        csvFiles.map(async (file) => ({
          name: file.webkitRelativePath
            ? file.webkitRelativePath.split('/').slice(1).join('/') || file.name
            : file.name,
          bytes: await file.arrayBuffer(),
        })),
      );
      submitFiles(inputs, request);
    } catch (e) {
      if (request === token.current) {
        setBusy(false);
        setProgress('');
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  }
  return {
    programs,
    keyencePrograms,
    commentsByProgram,
    busy,
    error,
    progress,
    load,
    openSelection,
    nativeCsv,
  };
}
