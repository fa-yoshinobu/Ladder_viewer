import { requireValue } from './requireValue';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { BatchResult, CsvInput } from './batch';
import { type DeviceComments } from './comments';
import type { KeyenceViewerProgram } from './keyence/viewerLayout';
import { isRemoteMitsubishi, type MitsubishiDocument } from './mitsubishiViewer';
import { fitLadderZoom } from './layout';
import { readSetting } from './settings';
import { decodeNativeCsvFiles, nativeCsvBridge, type NativeCsvSelection } from './nativeCsv';
import { programFormat } from './programFormat';
type ViewerBatch = Omit<BatchResult, 'keyencePrograms' | 'programs'> & {
  keyencePrograms: KeyenceViewerProgram[];
  programs: MitsubishiDocument[];
};
function batchDocuments(batch: ViewerBatch) {
  return [...batch.keyencePrograms, ...batch.programs.filter(isRemoteMitsubishi)];
}
function closeDocuments(programs: { port: MessagePort }[]) {
  for (const program of programs) {
    program.port.postMessage({ action: 'close' });
    program.port.close();
  }
}
export function useProgramFiles({
  showProgram,
  showKeyenceProgram,
  onComparison,
}: {
  showProgram: (program: MitsubishiDocument) => void;
  showKeyenceProgram: (program: KeyenceViewerProgram) => void;
  onComparison: (selection: NonNullable<NativeCsvSelection['comparison']>) => void;
}) {
  const [programs, setPrograms] = useState<MitsubishiDocument[]>([]);
  const [keyencePrograms, setKeyencePrograms] = useState<KeyenceViewerProgram[]>([]);
  const documents = useRef<{ port: MessagePort }[]>([]);
  const [commentsByProgram, setCommentsByProgram] = useState<Record<string, DeviceComments>>({});
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [busy, setBusy] = useState(false);
  const token = useRef(0);
  const parser = useRef<Worker | null>(null);
  const inputWarnings = useRef<string[]>([]);
  const nativeCsv = nativeCsvBridge();
  useLayoutEffect(() => {
    const worker = new Worker(new URL('./parser.worker.ts', import.meta.url), { type: 'module' });
    parser.current = worker;
    worker.onmessage = (
      e: MessageEvent<{ token: number; result?: ViewerBatch; progress?: string; error?: string }>,
    ) => {
      if (e.data.token !== token.current) {
        if (e.data.result) closeDocuments(batchDocuments(e.data.result));
        return;
      }
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
      closeDocuments(documents.current);
      documents.current = batchDocuments(result);
      setKeyencePrograms(result.keyencePrograms);
      setCommentsByProgram(result.commentsByProgram);
      setError('');
      setWarning(failures.join('\n'));

      if (result.programs.length) showProgram(requireValue(result.programs[0]));
      else
        showKeyenceProgram(
          result.keyencePrograms.find((p) => /^Main$/i.test(p.moduleName)) ??
            requireValue(result.keyencePrograms[0]),
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
      closeDocuments(documents.current);
      documents.current = [];
      worker.terminate();
      parser.current = null;
      nativeCsv?.removeEventListener('message', onNativeCsv);
    };
  }, []);
  function startLoad(progress = 'ファイルを読み込んでいます…') {
    const request = ++token.current;
    inputWarnings.current = [];
    setBusy(true);
    setProgress(progress);
    setError('');
    setWarning('');
    return request;
  }
  function submitFiles(inputs: CsvInput[], request: number) {
    if (request !== token.current) return;
    const pane = document.querySelector<HTMLElement>('main.diagram');
    const area = {
      height: pane?.clientHeight || window.innerHeight,
      zoom: fitLadderZoom(pane?.clientWidth || window.innerWidth, false),
      mode: readSetting('viewMode'),
      comments: readSetting('showComments'),
    };
    parser.current?.postMessage(
      { files: inputs, token: request, viewer: true, area },
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
    warning,
    dismissError: () => setError(''),
    dismissWarning: () => setWarning(''),
    progress,
    load,
    openSelection,
    nativeCsv,
  };
}
