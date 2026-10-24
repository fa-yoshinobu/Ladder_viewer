export interface StrokeCoordinates {
  x: (value: number) => number;
  y: (value: number) => number;
  width: number;
  scale: number;
}

// Both stroke edges land on physical pixels, even at fractional zoom/DPI.
export function strokeCoordinates(zoom: number, ratio: number, originX: number, originY: number, cssWidth = 1): StrokeCoordinates {
  const scale = zoom * ratio;
  const pixels = Math.max(1, Math.round(cssWidth * ratio));
  const offset = (pixels % 2) / 2;
  const snap = (value: number, origin: number) => (Math.round(value * scale + origin * ratio - offset) + offset - origin * ratio) / scale;
  return { x: value => snap(value, originX), y: value => snap(value, originY), width: pixels / scale, scale };
}
