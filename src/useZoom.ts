import { useState } from 'preact/hooks';
import { stepZoom } from './zoom';

export function useZoom(initial = 1, comparison = false) {
  const [zoom, setZoom] = useState(initial);
  return {
    zoom,
    setZoom,
    zoomOut: () => setZoom((value) => stepZoom(value, -1, comparison)),
    zoomIn: () => setZoom((value) => stepZoom(value, 1, comparison)),
  };
}
