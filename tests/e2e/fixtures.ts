import { expect, type Page } from '@playwright/test';

export const gx =
  '"Synthetic"\n"機種情報:"\t"RCPU R120"\n"ステップ番号"\t"命令"\t"I/O(デバイス)"\n"0"\t"LD"\t"M60"\n"1"\t"OUT"\t"M61"\n"2"\t"LD"\t"M80"\n"3"\t"OUT"\t"M81"';
export const mnm =
  'DEVICE:57\n;MODULE:Synthetic\nLD MR60 ; Synthetic input\nOUT MR61 ; Synthetic output\nLD MR80\nOUT MR81\nEND';
export const comments = (keyence: boolean, label: string) =>
  keyence
    ? `,,コメント1\n${Array.from({ length: 100 }, (_, i) => `MR${i},,${label}${i}`).join('\n')}`
    : `デバイス名\tJapanese/日本語\n${Array.from({ length: 100 }, (_, i) => `M${i}\t${label}${i}`).join('\n')}`;
export function script(number = 17) {
  const source = ["'Synthetic calculation", '\tDummyTotal = DummyInput + #17'];
  return [
    'DEVICE:57',
    ';MODULE:Synthetic',
    ';SCRIPT_TYPE:',
    ...source.map((s) => ';' + s),
    'LD MR830',
    'NCJ #831',
    ...source.map((s) => ';' + s),
    'LD CR2002',
    'LDA DM831',
    'CON',
    'ADD #' + number,
    'CON',
    'STA DM832',
    'LABEL #831',
    'LD MR833',
    'OUT MR834',
    'END',
  ].join('\n');
}
export async function drop(page: Page, selector: string, files: { name: string; text: string }[]) {
  await page.locator(selector).evaluate((el, inputs) => {
    const transfer = new DataTransfer();
    for (const input of inputs) transfer.items.add(new File([input.text], input.name));
    el.dispatchEvent(
      new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }),
    );
  }, files);
}
export async function comparison(page: Page, text: string, target: string, name: string) {
  await page.getByRole('button', { name: '比較モード', exact: true }).click();
  await drop(page, '.direct-input[data-side="source"]', [{ name, text }]);
  await expect(page.locator('.direct-comparison-app')).toHaveAttribute(
    'data-source-status',
    'ready',
  );
  await drop(page, '.direct-input[data-side="target"]', [{ name, text: target }]);
  await expect(page.locator('.direct-comparison-app')).toHaveAttribute(
    'data-target-status',
    'ready',
  );
}
