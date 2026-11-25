import { useLayoutEffect, useMemo, useState } from 'preact/hooks';
import { restoreViewerGrid } from './layout';
import type { Network } from './model';
import type { RemoteMitsubishi, MitsubishiPaint } from './mitsubishiViewer';

let requestNumber = 0;
export function useMitsubishiCircuits(
  program: RemoteMitsubishi | null,
  first: number,
  end: number,
  jumpIndex: number,
) {
  const cache = useMemo(
    () =>
      new Map<string, Network>(
        program?.initial.map(({ network, grid }) => [network.id, restoreViewerGrid(network, grid)]),
      ),
    [program],
  );
  const [, refresh] = useState(0);
  const [error, setError] = useState('');
  useLayoutEffect(() => {
    setError('');
    if (!program) return;
    const wanted = new Set<number>();
    for (let index = first; index < end; index++) wanted.add(index);
    if (jumpIndex >= 0) wanted.add(jumpIndex);
    const ids = new Set<string>();
    const missing: number[] = [];
    for (const index of wanted) {
      const id = program.networks[index]?.id;
      if (!id) continue;
      ids.add(id);
      if (!cache.has(id)) missing.push(index);
    }
    for (const id of cache.keys()) if (!ids.has(id)) cache.delete(id);
    if (!missing.length) return;
    const request = ++requestNumber;
    const receive = ({
      data,
    }: MessageEvent<{ request: number; drawings?: MitsubishiPaint[]; error?: string }>) => {
      if (data.request !== request) return;
      if (data.error) {
        setError(data.error);
        return;
      }
      for (const { network, grid } of data.drawings ?? [])
        cache.set(network.id, restoreViewerGrid(network, grid));
      refresh((value) => value + 1);
    };
    program.port.addEventListener('message', receive);
    program.port.start();
    program.port.postMessage({ action: 'range', indices: missing, request });
    return () => program.port.removeEventListener('message', receive);
  }, [program, cache, first, end, jumpIndex]);
  return { cache, error, dismissDrawingError: () => setError('') };
}
