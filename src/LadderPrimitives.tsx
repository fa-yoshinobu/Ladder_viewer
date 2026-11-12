import type { StrokeCoordinates } from './drawing';

export type LadderGlyphKind =
  | 'contact'
  | 'coil'
  | 'command'
  | 'comparison'
  | 'pulse'
  | 'invert'
  | 'labeled-coil'
  | 'calculation';
export function LadderGlyph({
  kind,
  x,
  y,
  width,
  c,
  negated = false,
  pulse = null,
  inputClass = 'wire',
  outputClass = 'wire',
}: {
  kind: LadderGlyphKind;
  x: number;
  y: number;
  width: number;
  c: StrokeCoordinates;
  negated?: boolean;
  pulse?: 'rise' | 'fall' | null;
  inputClass?: string;
  outputClass?: string;
}) {
  const X = c.x,
    Y = c.y,
    center = x + width / 2;
  const line = (a: number, b: number, className: string) => (
    <line class={className} x1={X(a)} y1={Y(y)} x2={X(b)} y2={Y(y)} />
  );
  const mark = (operation: 'rise' | 'fall') => {
    const direction = operation === 'rise' ? -1 : 1;
    return (
      <path
        class="contact"
        d={`M${X(center)},${Y(y - direction * 6)}V${Y(y + direction * 7)} M${X(center - 4)},${Y(y + direction * 3)}L${X(center)},${Y(y + direction * 7)}L${X(center + 4)},${Y(y + direction * 3)}`}
      />
    );
  };
  if (kind === 'coil') {
    const radius = Math.round(7 * c.scale) / c.scale;
    return (
      <>
        <line class={inputClass} x1={X(x)} y1={Y(y)} x2={X(center) - radius} y2={Y(y)} />
        <line class={outputClass} x1={X(center) + radius} y1={Y(y)} x2={X(x + width)} y2={Y(y)} />
        <circle class="contact coil" cx={X(center)} cy={Y(y)} r={radius} />
      </>
    );
  }
  if (kind === 'contact')
    return (
      <>
        {line(x, center - 7, inputClass)}
        {line(center + 7, x + width, outputClass)}
        <path
          class="contact"
          d={`M${X(center - 7)},${Y(y - 7)}V${Y(y + 7)} M${X(center + 7)},${Y(y - 7)}V${Y(y + 7)}`}
        />
        {negated && (
          <path
            class="contact"
            d={`M${X(center - 10)},${Y(y + 7)}L${X(center + 10)},${Y(y - 7)}`}
          />
        )}
        {pulse && mark(pulse)}
      </>
    );
  if (kind === 'pulse' || kind === 'invert')
    return (
      <>
        {line(x, center, inputClass)}
        {line(center, x + width, outputClass)}
        {kind === 'invert' ? (
          <path
            class="contact inv-mark"
            d={`M${X(center - 10)},${Y(y + 7)}L${X(center + 10)},${Y(y - 7)}`}
          />
        ) : (
          mark(pulse ?? 'rise')
        )}
      </>
    );
  return (
    <>
      {line(x, x + 6, inputClass)}
      {line(x + width - 6, x + width, outputClass)}
      {kind === 'labeled-coil' ? (
        <path
          class="command-outline"
          d={[
            'M',
            X(x + 12),
            Y(y - 10),
            'Q',
            X(x),
            Y(y),
            X(x + 12),
            Y(y + 10),
            'M',
            X(x + width - 12),
            Y(y - 10),
            'Q',
            X(x + width),
            Y(y),
            X(x + width - 12),
            Y(y + 10),
          ].join(' ')}
        />
      ) : kind === 'calculation' ? (
        <path
          class="command-outline"
          d={[
            'M',
            X(x + 12),
            Y(y - 10),
            'L',
            X(x + 6),
            Y(y),
            X(x + 12),
            Y(y + 10),
            'M',
            X(x + width - 12),
            Y(y - 10),
            'L',
            X(x + width - 6),
            Y(y),
            X(x + width - 12),
            Y(y + 10),
          ].join(' ')}
        />
      ) : kind === 'comparison' ? (
        <path
          class="command-outline"
          d={`M${X(x + 12)},${Y(y - 10)}H${X(x + 6)}V${Y(y + 10)}H${X(x + 12)} M${X(x + width - 12)},${Y(y - 10)}H${X(x + width - 6)}V${Y(y + 10)}H${X(x + width - 12)}`}
        />
      ) : (
        <rect
          class="command-outline"
          x={X(x + 6)}
          y={Y(y - 11)}
          width={X(x + width - 6) - X(x + 6)}
          height={Y(y + 11) - Y(y - 11)}
        />
      )}
    </>
  );
}

export function SelectionRect({
  phase,
  x,
  y,
  width,
  height,
  selected = false,
  hovered = false,
  difference,
  className = '',
}: {
  phase: 'background' | 'frame';
  x: number;
  y: number;
  width: number;
  height: number;
  selected?: boolean;
  hovered?: boolean;
  difference?: 'added' | 'removed' | 'changed' | 'step';
  className?: string;
}) {
  const classes = [
    phase === 'background' ? 'ladder-selection-bg' : 'ladder-selection-frame',
    className,
    selected ? 'selected' : '',
    hovered ? 'hovered' : '',
    difference ? 'diff-' + difference : '',
  ]
    .filter(Boolean)
    .join(' ');
  if (phase === 'background')
    return (
      <rect
        class={classes}
        x={x}
        y={y}
        width={width}
        height={height}
        rx={2}
        pointer-events="none"
      />
    );
  return (
    <>
      <rect class="ladder-hit" x={x} y={y} width={width} height={height} rx={2} />
      <rect
        class={classes}
        x={x + 2}
        y={y + 2}
        width={Math.max(0, width - 4)}
        height={Math.max(0, height - 4)}
        rx={2}
        pointer-events="none"
      />
    </>
  );
}
