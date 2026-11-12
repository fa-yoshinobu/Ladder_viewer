import { CELL, LEFT_GUTTER } from '../ladderMetrics';
import { commentLines } from '../textLayout';
import type { KeyenceFb, KeyenceFbPin, KeyenceInstruction } from './model';
import { keyenceStLayout, ST_ROW_HEIGHT } from './structuredText';

const units = (text: string) =>
  Array.from(text).reduce(
    (n, char) => n + (char.charCodeAt(0) < 256 || /[\uFF61-\uFF9F]/.test(char) ? 1 : 2),
    0,
  );
export const keyenceBlockLines = (text: string, width: number) =>
  commentLines(text, Math.max(4, Math.floor(width / 6)), Number.MAX_SAFE_INTEGER);
export interface KeyenceBlockPinPlacement {
  pin: KeyenceFbPin;
  side: 'input' | 'output' | 'argument';
  y: number;
  nameLines: string[];
  valueLines: string[];
}
export function keyenceBlockGeometry(fb: KeyenceFb) {
  const known = !!fb.knownSignature;
  const inputs = fb.pins.filter((pin) => pin.direction === 'input' || pin.direction === 'inout');
  const outputs = fb.pins.filter(
    (pin) => pin.direction === 'output' || (pin.direction === 'inout' && !pin.constant),
  );
  const longest = (pins: KeyenceFbPin[], field: 'name' | 'value') =>
    Math.max(0, ...pins.map((pin) => units(pin[field])));
  const valueColumns = (pins: KeyenceFbPin[]) =>
    Math.max(1, Math.min(3, Math.ceil((longest(pins, 'value') * 6 + 16) / CELL)));
  const leftColumns = known ? valueColumns(inputs) : 0,
    rightColumns = known ? valueColumns(outputs) : 0;
  const bodyColumns = known
    ? Math.max(
        2,
        Math.min(
          4,
          Math.ceil(
            Math.max(
              units(fb.name) * 6 + 16,
              Math.max(longest(inputs, 'name'), longest(outputs, 'name')) * 12 + 24,
            ) / CELL,
          ),
        ),
      )
    : 6;
  const columns = leftColumns + bodyColumns + rightColumns,
    width = columns * CELL;
  const left = known ? leftColumns * CELL : 6,
    right = known ? (leftColumns + bodyColumns) * CELL : width - 6;
  const titleLines = keyenceBlockLines(fb.name, right - left - 16),
    instanceLines = fb.instance ? keyenceBlockLines(fb.instance, right - left - 8) : [];
  const bodyTop = (known ? -8 : -7) - Math.max(1, titleLines.length) * 14,
    top = instanceLines.length ? bodyTop - 3 - instanceLines.length * 12 : bodyTop;
  const rows = new Map<
    number,
    {
      pin: KeyenceFbPin;
      side: KeyenceBlockPinPlacement['side'];
      nameLines: string[];
      valueLines: string[];
    }[]
  >();
  let inputRow = 0,
    outputRow = 0;
  const add = (pin: KeyenceFbPin, side: KeyenceBlockPinPlacement['side'], row: number) => {
    const group = rows.get(row) ?? [];
    group.push({
      pin,
      side,
      nameLines: keyenceBlockLines(pin.name, known ? (right - left - 24) / 2 : 90),
      valueLines: keyenceBlockLines(
        pin.value,
        known ? (side === 'input' ? leftColumns : rightColumns) * CELL - 16 : width - 128,
      ),
    });
    rows.set(row, group);
  };
  for (const [index, pin] of fb.pins.entries()) {
    if (!known) add(pin, 'argument', index);
    else {
      if (pin.direction === 'input' || pin.direction === 'inout') {
        const row = pin.inputRow ?? inputRow;
        add(pin, 'input', row);
        inputRow = Math.max(inputRow, row + 1);
      }
      if (pin.direction === 'output' || (pin.direction === 'inout' && !pin.constant)) {
        const row = pin.outputRow ?? outputRow;
        add(pin, 'output', row);
        outputRow = Math.max(outputRow, row + 1);
      }
    }
  }
  const pins: KeyenceBlockPinPlacement[] = [];
  let cursor = known ? 26 : 30;
  for (let row = 0; row <= Math.max(-1, ...rows.keys()); row++) {
    const group = rows.get(row) ?? [];
    for (const pin of group) pins.push({ ...pin, y: cursor });
    cursor += Math.max(
      known ? 26 : 44,
      ...group.map((pin) => Math.max(pin.nameLines.length, pin.valueLines.length) * 12 + 12),
    );
  }
  const bottom = known ? (rows.size ? cursor - 12 : 14) : cursor + 16;
  return {
    known,
    columns,
    width,
    left,
    right,
    bodyTop,
    top,
    bottom,
    titleLines,
    instanceLines,
    pins,
  };
}

export function keyenceStBoxGeometry(instruction: KeyenceInstruction) {
  const longest = Math.max(
    0,
    ...(instruction.st?.lines ?? []).map((line) => units(line.text.replaceAll('\t', '    '))),
  );
  const columns = Math.max(6, Math.min(8, Math.ceil((longest * 7 + 24) / CELL))),
    width = columns * CELL;
  const rows = keyenceStLayout(instruction, true, width + LEFT_GUTTER).rows;
  return { columns, width, rows, top: -22, bottom: Math.max(1, rows.length) * ST_ROW_HEIGHT - 12 };
}
