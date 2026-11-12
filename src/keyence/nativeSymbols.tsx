import type { StrokeCoordinates } from '../drawing';
import { LadderGlyph } from '../LadderPrimitives';
import type { KeyenceSymbol } from './layout';
import { keyenceOutputStyle, keyenceBoxColumnSpans } from './outputStyle';
import { keyenceMacroGeometry } from './macroGeometry';

// KEYENCE's operand positions and pulse marks are local to these symbols.
export function KeyenceNativeSymbol({
  symbol,
  c,
}: {
  symbol: KeyenceSymbol;
  c: StrokeCoordinates;
}) {
  const { x, y, width, instruction } = symbol,
    center = x + width / 2,
    X = c.x,
    Y = c.y;
  const style = keyenceOutputStyle(instruction),
    kind = symbol.kind === 'comparison' && style.kind !== 'stage' ? 'comparison' : style.kind;
  const part = (text: string, operand?: number, includesOpcode = false) => {
    const diff = instruction.difference,
      changed =
        diff?.kind === 'changed' &&
        (operand === undefined
          ? diff.opChanged
          : diff.operandChanges.includes(operand) || (includesOpcode && diff.opChanged));
    return <tspan class={changed ? 'diff-value' : ''}>{text}</tspan>;
  };
  const wire = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    difference?: 'added' | 'removed',
  ) => (
    <line
      class={difference ? 'wire wire-' + difference : 'wire'}
      x1={X(x1)}
      y1={Y(y1)}
      x2={X(x2)}
      y2={Y(y2)}
    />
  );
  const path = (d: string, className = 'command-outline') => <path class={className} d={d} />;
  const pulse = (at: number, direction = -1) =>
    path(
      `M${X(at)},${Y(y - direction * 6)}V${Y(y + direction * 7)} M${X(at - 3)},${Y(y + direction * 3)}L${X(at)},${Y(y + direction * 7)}L${X(at + 3)},${Y(y + direction * 3)}`,
      'contact kv-execution-pulse',
    );
  const execution = style.pulse ? pulse(x + 3) : null;
  if (kind === 'command' && style.body === 'MCALL' && (style.operands?.length ?? 0) > 1) {
    const { spans, parameters, comment, annotationLines, annotationY } = keyenceMacroGeometry(
        instruction,
        symbol.showComments,
      ),
      unit = width / spans.reduce((a, b) => a + b, 0);
    const starts = spans.map(
      (_, index) => x + spans.slice(0, index).reduce((a, b) => a + b, 0) * unit,
    );
    return (
      <g class="kv-native-box kv-native-macro">
        {wire(x, y, x + 6, y, symbol.inputDifference)}
        {wire(x + width - 6, y, x + width, y, symbol.outputDifference)}
        <rect
          class="command-outline"
          x={X(x + 6)}
          y={Y(y - 21)}
          width={X(x + width - 6) - X(x + 6)}
          height={Y(y + 17) - Y(y - 21)}
        />
        {starts.slice(1).map((at) => wire(at, y - 21, at, y + 17))}
        <text class="operator" x={x + 12} y={y - 23} style={{ textAnchor: 'start' }}>
          {part(style.body)} {part(instruction.operands[0], 0)}
        </text>
        {parameters.map((parameter, index) => (
          <g key={index}>
            <text
              class="device kv-macro-parameter"
              x={starts[index] + (spans[index] * unit) / 2}
              y={y - 6}
            >
              {parameter.name}
            </text>
            <text
              class="device kv-native-operand"
              x={starts[index] + (spans[index] * unit) / 2}
              y={y + 9}
            >
              {part(parameter.value, parameter.operandIndex)}
            </text>
            {parameter.commentLines.length > 0 && (
              <text class="device-comment" x={starts[index] + 6} y={y + 27}>
                <title>{parameter.comment}</title>
                {parameter.commentLines.map((line, row) => (
                  <tspan key={row} x={starts[index] + 6} dy={row ? 12 : 0}>
                    {line}
                  </tspan>
                ))}
              </text>
            )}
          </g>
        ))}
        {annotationLines.length > 0 && (
          <text class="device-comment" x={x + 6} y={y + annotationY}>
            <title>{comment}</title>
            {annotationLines.map((line, row) => (
              <tspan key={row} x={x + 6} dy={row ? 12 : 0}>
                {line}
              </tspan>
            ))}
          </text>
        )}
        {execution}
      </g>
    );
  }
  if (kind === 'command' && style.operands) {
    const spans = keyenceBoxColumnSpans(style),
      unit = width / spans.reduce((a, b) => a + b, 0),
      columns = spans.length;
    const starts = spans.map(
      (_, index) => x + spans.slice(0, index).reduce((a, b) => a + b, 0) * unit,
    );
    const middle = (index: number) => starts[index] + (spans[index] * unit) / 2;
    const macro = style.body === 'MCALL',
      offset = style.operatorColumn || macro ? 1 : 0,
      operandColumns = columns - offset;
    const rows = Math.max(1, Math.ceil(style.operands.length / operandColumns));
    const body =
      style.body +
      ((style.body === 'MC' || style.body === 'MCR') && symbol.controlLevel !== undefined
        ? ' ' + symbol.controlLevel
        : '');
    return (
      <g class="kv-native-box">
        {wire(x, y, x + 6, y, symbol.inputDifference)}
        {wire(x + width - 6, y, x + width, y, symbol.outputDifference)}
        <rect
          class="command-outline"
          x={X(x + 6)}
          y={Y(y - 21)}
          width={X(x + width - 6) - X(x + 6)}
          height={Y(y + 17) - Y(y - 21)}
        />
        {!macro && starts.slice(1).map((at) => wire(at, y - 21, at, y + 17))}
        <text
          class="operator"
          x={middle(0)}
          y={style.operatorColumn || !style.operands.length ? y + 4 : y - 9}
        >
          {part(body)}
        </text>
        {style.operands.map((operand, index) => (
          <text
            key={index}
            class="device kv-native-operand"
            x={middle(offset + (index % operandColumns))}
            y={macro ? y - 9 : rows === 1 ? y + 9 : y + 2 + Math.floor(index / operandColumns) * 12}
          >
            {part(operand, index)}
          </text>
        ))}
        {execution}
      </g>
    );
  }
  if (kind === 'keep' || kind === 'multi-input') {
    const ports = symbol.ports ?? [],
      bottom = Math.max(y, ...ports.map((port) => port.y));
    return (
      <g class="kv-native-inputs">
        <rect
          class="command-outline"
          x={X(x + 6)}
          y={Y(y - 21)}
          width={X(x + width - 6) - X(x + 6)}
          height={Y(bottom + 22) - Y(y - 21)}
        />
        <text class="operator" x={center} y={y - 9}>
          {part(style.body, style.bodyOperand, true)}
        </text>
        <text class="device" x={center} y={y + 18}>
          {part(style.above, style.aboveOperand)}
        </text>
        {style.below && (
          <text class="device" x={center} y={bottom + 18}>
            {part(style.below, style.belowOperand)}
          </text>
        )}
        {ports.map((port, index) => (
          <g key={port.name}>
            {wire(x, port.y, x + 6, port.y, port.difference)}
            <text class="command-text" x={x + 12} y={port.y + 4}>
              {port.name}
            </text>
            {index === 0 && wire(x + width - 6, port.y, x + width, port.y, symbol.outputDifference)}
          </g>
        ))}
        {execution}
      </g>
    );
  }
  if (kind === 'coil')
    return (
      <g class="kv-native-coil">
        <LadderGlyph
          kind="coil"
          x={x}
          y={y}
          width={width}
          c={c}
          inputClass={symbol.inputDifference ? 'wire wire-' + symbol.inputDifference : 'wire'}
          outputClass={symbol.outputDifference ? 'wire wire-' + symbol.outputDifference : 'wire'}
        />
        {style.negated &&
          path(
            `M${X(center - 10)},${Y(y + 9)}L${X(center + 10)},${Y(y - 9)}`,
            'contact kv-negated',
          )}
        <text class="device" x={center} y={y - 15}>
          {part(style.body, style.bodyOperand)}
        </text>
        {execution}
      </g>
    );
  if (kind === 'command' || kind === 'fb') return null;
  const comparison = kind === 'comparison';
  const operands = instruction.operands,
    operator = comparison
      ? symbol.label.slice(0, symbol.label.length - operands.join(' ').length).trim()
      : style.body;
  const above = comparison ? (operands[0] ?? '') : style.above,
    below = comparison ? operands.slice(1).join(' ') : style.below;
  const special = kind === 'stage' || kind === 'jump' || kind === 'wait';
  return (
    <g class={'kv-native-' + kind}>
      {special ? (
        <>
          {wire(x, y, x + 8, y, symbol.inputDifference)}
          {wire(x + width - 8, y, x + width, y, symbol.outputDifference)}
          {path(
            `M${X(x + 8)},${Y(y - 7)}V${Y(y + 7)} M${X(x + width - 8)},${Y(y - 7)}V${Y(y + 7)}`,
          )}
          {kind === 'wait' &&
            path(
              `M${X(x + 10)},${Y(y - 7)}V${Y(y + 7)} M${X(x + width - 10)},${Y(y - 7)}V${Y(y + 7)}`,
            )}
          {kind === 'jump' &&
            path(
              `M${X(x + width - 13)},${Y(y - 4)}L${X(x + width - 8)},${Y(y)}L${X(x + width - 13)},${Y(y + 4)}`,
            )}
        </>
      ) : (
        <LadderGlyph
          kind={
            kind === 'counter' || kind === 'bit-coil' || kind === 'labeled-coil'
              ? 'labeled-coil'
              : kind === 'calculation'
                ? 'calculation'
                : 'comparison'
          }
          x={x}
          y={y}
          width={width}
          c={c}
          inputClass={symbol.inputDifference ? 'wire wire-' + symbol.inputDifference : 'wire'}
          outputClass={symbol.outputDifference ? 'wire wire-' + symbol.outputDifference : 'wire'}
        />
      )}
      {(style.negated || (comparison && symbol.negated)) &&
        path(`M${X(x + 9)},${Y(y + 11)}L${X(x + width - 9)},${Y(y - 11)}`, 'contact kv-negated')}
      {kind === 'wait' && (operator === 'UE' || operator === 'DE') ? (
        pulse(center, operator === 'UE' ? -1 : 1)
      ) : (
        <text class="operator" x={center} y={y + 4}>
          {part(
            operator,
            comparison ? undefined : style.bodyOperand,
            kind === 'timer' || kind === 'counter',
          )}
        </text>
      )}
      {above && (
        <text class="device" x={center} y={y - 15}>
          {part(above, comparison ? 0 : style.aboveOperand)}
        </text>
      )}
      {below && (
        <text class="device" x={center} y={y + 21}>
          {comparison
            ? operands.slice(1).map((operand, index) => (
                <tspan key={index}>
                  {index ? ' ' : ''}
                  {part(operand, index + 1)}
                </tspan>
              ))
            : part(below, style.belowOperand)}
        </text>
      )}
      {execution}
    </g>
  );
}
