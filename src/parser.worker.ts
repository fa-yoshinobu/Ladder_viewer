import { parseCsvBatch, type CsvInput } from './batch';
import { compareDirectPair, unchangedDirectPair, type DirectPair } from './directComparison';
import { serveKeyenceProgram } from './keyence/viewerLayout';
import { serveMitsubishiProgram, isRemoteMitsubishi, type ViewerArea } from './mitsubishiViewer';
self.onmessage = (
  event: MessageEvent<
    | { files: CsvInput[]; token: number; viewer?: boolean; area?: ViewerArea }
    | { action: 'compare'; pair: DirectPair; token: number }
    | { action: 'compare-index'; pairs: DirectPair[]; token: number }
  >,
) => {
  const request = event.data,
    token = request.token;
  try {
    if ('action' in request && request.action === 'compare-index') {
      const overview: Record<string, boolean> = {};
      for (const [index, pair] of request.pairs.entries()) {
        overview[pair.id] = unchangedDirectPair(pair);
        self.postMessage({ token, overviewProgress: index + 1 });
      }
      self.postMessage({ token, overview });
    } else if ('action' in request && request.action === 'compare')
      self.postMessage({ token, comparison: compareDirectPair(request.pair) });
    else if ('files' in request) {
      const result = parseCsvBatch(request.files, (done, total, name) =>
        self.postMessage({ token, progress: `${done} / ${total}　${name}` }),
      );
      if (request.viewer) {
        const keyencePrograms = result.keyencePrograms.map(serveKeyenceProgram);
        const programs = result.programs.map((program, index) =>
          program.comparison
            ? program
            : serveMitsubishiProgram(
                program,
                Object.keys(result.commentsByProgram[program.name] ?? {}).length > 0,
                index === 0 ? request.area : undefined,
              ),
        );
        const documents = programs.filter(isRemoteMitsubishi);
        self.postMessage(
          { token, result: { ...result, keyencePrograms, programs } },
          {
            transfer: [
              ...keyencePrograms.map((p) => p.port),
              ...documents.flatMap((p) => [p.port, p.sizes.buffer]),
            ],
          },
        );
      } else self.postMessage({ token, result });
    }
  } catch (error) {
    self.postMessage({ token, error: error instanceof Error ? error.message : String(error) });
  }
};
