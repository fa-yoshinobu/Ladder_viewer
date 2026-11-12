import { nativeCsvBridge } from './nativeCsv';

export function blockRangeText(
  blocks: readonly {
    instructions: readonly { step?: string; sourceLine?: number; sourceEndLine?: number }[];
  }[],
): string {
  const instructions = blocks.flatMap((block) => block.instructions);
  const steps = instructions.map((i) => i.step?.trim()).filter((step): step is string => !!step);
  if (steps.length) return `STEP ${steps[0]}～${steps.at(-1)}`;
  const lines = instructions
    .map((i) => i.sourceLine)
    .filter((line): line is number => line !== undefined && Number.isFinite(line));
  return lines.length
    ? `元ファイル ${lines[0]}～${instructions.at(-1)?.sourceEndLine ?? lines.at(-1)}行`
    : '';
}

export function comparisonRangeText(source: string, target: string): string {
  return source || target ? `比較元 ${source || '（なし）'}\r\n比較先 ${target || '（なし）'}` : '';
}

export function blockRangeMenu(event: MouseEvent, text: string): void {
  if (!text) return;
  event.preventDefault();
  event.stopPropagation();
  nativeCsvBridge()?.postMessage({ type: 'instruction-menu', text });
}
