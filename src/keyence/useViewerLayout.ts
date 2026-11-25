import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { KeyencePaintDrawing } from './layout';
import type {
  ConfigureLayout,
  KeyenceRow,
  KeyenceViewerProgram,
  LayoutReply,
} from './viewerLayout';

const emptyRows: KeyenceRow[] = [];
const emptyDrawings = new Map<number, KeyencePaintDrawing>();
let nextRevision = 0;

export function useViewerLayout(
  program: KeyenceViewerProgram,
  expanded: Set<string>,
  showComments: boolean,
  mode: 'wrap' | 'scroll',
  top: number,
  viewportHeight: number,
  zoom: number,
) {
  const [scene, setScene] = useState<{
    program: KeyenceViewerProgram;
    revision: number;
    rows: KeyenceRow[];
    drawings: Map<number, KeyencePaintDrawing>;
  }>();
  const [error, setError] = useState('');
  const revision = useRef(0),
    pending = useRef(new Set<number>()),
    wanted = useRef(new Set<number>());
  useLayoutEffect(() => {
    const current = ++nextRevision;
    revision.current = current;
    pending.current.clear();
    setError('');
    const receive = (event: MessageEvent<LayoutReply>) => {
      const message = event.data;
      if (message.revision !== current) return;
      if (message.error) {
        setError(message.error);
        return;
      }
      if (message.rows) {
        setScene({
          program,
          revision: current,
          rows: message.rows,
          drawings: new Map(message.drawings),
        });
      } else if (message.drawings) {
        const received = message.drawings;
        for (const [index] of received) pending.current.delete(index);
        setScene((old) => {
          if (!old || old.revision !== current) return old;
          const drawings = new Map(
            [...old.drawings, ...received].filter(([index]) => wanted.current.has(index)),
          );
          return { ...old, drawings };
        });
      }
    };
    program.port.addEventListener('message', receive);
    program.port.start();
    const request: ConfigureLayout = {
      action: 'configure',
      revision: current,
      expanded: [...expanded],
      showComments,
      mode,
      top,
      viewportHeight,
      zoom,
    };
    program.port.postMessage(request);
    return () => program.port.removeEventListener('message', receive);
  }, [program, expanded, showComments, mode]);
  const active = scene?.program === program ? scene : undefined;
  const requestDrawings = (indexes: number[]) => {
    if (!active || active.revision !== revision.current) return;
    wanted.current = new Set(indexes);
    const missing = [...wanted.current].filter(
      (index) => !active.drawings.has(index) && !pending.current.has(index),
    );
    if (!missing.length) return;
    for (const index of missing) pending.current.add(index);
    program.port.postMessage({ action: 'range', revision: active.revision, indexes: missing });
  };
  return {
    rows: active?.rows ?? emptyRows,
    drawings: active?.drawings ?? emptyDrawings,
    requestDrawings,
    error,
    dismissError: () => setError(''),
  };
}
