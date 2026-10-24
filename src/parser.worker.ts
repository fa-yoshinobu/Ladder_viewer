import { parseCsvBatch, type CsvInput } from './batch';
self.onmessage = (event: MessageEvent<{ files: CsvInput[]; token: number }>) => {
  const { files, token } = event.data;
  try {
    const result = parseCsvBatch(files, (done, total, name) => self.postMessage({ token, progress: `${done} / ${total}　${name}` }));
    self.postMessage({ token, result });
  } catch (error) {
    self.postMessage({ token, error: error instanceof Error ? error.message : String(error) });
  }
};
