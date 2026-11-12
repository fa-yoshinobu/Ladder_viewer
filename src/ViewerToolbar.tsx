import type { ComponentChildren } from 'preact';
import type { LadderViewMode } from './layout';

export const ladderPalettes = [
  { value: 'standard', label: '標準' },
  { value: 'contrast', label: '高コントラスト' },
  { value: 'soft', label: '目にやさしい' },
  { value: 'cud', label: '色覚配慮（CUD）' },
  { value: 'blue', label: 'ブルー' },
] as const;
export type LadderPalette = (typeof ladderPalettes)[number]['value'];

interface Props {
  hasComments?: boolean;
  comments: boolean;
  onComments: (value: boolean) => void;
  dark: boolean;
  palette: string;
  onPalette: (value: LadderPalette) => void;
  viewMode: LadderViewMode;
  onViewMode: (value: LadderViewMode) => void;
  zoom: number;
  onFit: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onResetZoom: () => void;
  children?: ComponentChildren;
}

export function ViewerToolbar(props: Props) {
  return (
    <>
      {props.hasComments !== false && (
        <label class="comment-toggle">
          <input
            type="checkbox"
            checked={props.comments}
            onChange={(e) => props.onComments(e.currentTarget.checked)}
          />
          コメント
        </label>
      )}
      {props.children}
      <label class="ladder-palette">
        ラダー配色
        <select
          aria-label={`ラダー配色（${props.dark ? 'ダーク' : 'ライト'}モード）`}
          title={`${props.dark ? 'ダーク' : 'ライト'}モード用の配色`}
          value={props.palette}
          onChange={(e) => props.onPalette(e.currentTarget.value as LadderPalette)}
        >
          {ladderPalettes.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label class="view-mode">
        長い回路
        <select
          aria-label="長い回路の表示"
          value={props.viewMode}
          onChange={(e) => props.onViewMode(e.currentTarget.value as LadderViewMode)}
        >
          <option value="wrap">折り返し</option>
          <option value="scroll">横スクロール</option>
        </select>
      </label>
      <button onClick={props.onFit}>幅に合わせる</button>
      <button aria-label="縮小" onClick={props.onZoomOut}>
        −
      </button>
      <button onClick={props.onResetZoom}>{Math.round(props.zoom * 100)}%</button>
      <button aria-label="拡大" onClick={props.onZoomIn}>
        ＋
      </button>
    </>
  );
}
