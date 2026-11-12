import { LADDER_WIDTH } from './ladderMetrics';

export function clampZoom(value: number, comparison = false) {
  return Math.min(1.5, Math.max(comparison ? 0.25 : 0.5, value));
}

export function stepZoom(value: number, direction: -1 | 1, comparison = false) {
  const ticks = value * 10;
  const next = direction > 0 ? Math.floor(ticks + 1e-9) + 1 : Math.ceil(ticks - 1e-9) - 1;
  return clampZoom(next / 10, comparison);
}

export function fitZoom(width: number, comparison = false, reservedWidth = comparison ? 170 : 0) {
  const available = (width - reservedWidth) / (comparison ? 2 : 1);
  return clampZoom(Math.floor(((available - 24) / LADDER_WIDTH) * 100) / 100, comparison);
}
