import { test, expect } from '@playwright/test';
import { comparison, drop } from './fixtures';

test('Mitsubishi search reaches a symbol inside a distant wrapped circuit from the worker', async ({
  page,
}) => {
  await page.goto('/');
  const commands = [
    ...Array.from({ length: 180 }, (_, i) => ['LD M' + i, 'OUT Y' + i]).flat(),
    'LD M800000',
    ...Array.from({ length: 80 }, (_, i) => 'AND M' + (810000 + i)),
    'OUT Y800000',
    ...Array.from({ length: 35 }, (_, i) => ['LD M' + (820000 + i), 'OUT Y' + (820000 + i)]).flat(),
  ];
  const text =
    'ステップ番号\t命令\tI/O(デバイス)\n' +
    commands.map((line, i) => [i, ...line.split(' ')].join('\t')).join('\n');
  await drop(page, '.app', [{ name: 'distant.csv', text }]);
  await expect(page.locator('.navigation .panel-title span')).toHaveText('216');
  const search = page.locator('.search-query');
  await search.fill('M810079');
  const target = page.locator('.symbol[aria-label="AND M810079"]').last();
  await expect(target).toHaveClass(/chosen/);
  await expect(target).toBeInViewport();
  await expect(page.locator('.nav-item.active .number')).toHaveText('181');
  await page.getByLabel('長い回路の表示').selectOption('scroll');
  await search.fill('M820005');
  await expect(page.locator('.symbol[aria-label="LD M820005"]')).toHaveClass(/chosen/);
  await search.fill('M810079');
  await expect(target).toHaveClass(/chosen/);
  await expect(target).toBeInViewport();
});

for (const keyence of [false, true]) {
  test(`${keyence ? 'KEYENCE' : 'Mitsubishi'} 5,000 circuits keep navigation bounded and follow selection`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto('/');
    const device = keyence ? 'MR' : 'M';
    const text = keyence
      ? 'DEVICE:57\n;MODULE:SyntheticLarge\n' +
        Array.from({ length: 5000 }, (_, i) => `LD MR${i * 2}\nOUT MR${i * 2 + 1}`).join('\n') +
        '\nEND'
      : '"SyntheticLarge"\n"機種情報:"\t"RCPU R120"\n"ステップ番号"\t"命令"\t"I/O(デバイス)"\n' +
        Array.from(
          { length: 5000 },
          (_, i) => `${i * 2}\tLD\tM${i * 2}\n${i * 2 + 1}\tOUT\tM${i * 2 + 1}`,
        ).join('\n');
    await drop(page, '.app', [
      { name: keyence ? 'synthetic-large.mnm' : 'synthetic-large.csv', text },
    ]);
    await expect(page.locator('.navigation .panel-title span')).toHaveText(
      keyence ? '5001' : '5000',
    );
    expect(await page.locator('.nav-item').count()).toBeLessThan(100);
    await page.locator('.nav-list').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const last = page.locator('.nav-item').filter({ hasText: `OUT ${device}9999` });
    await expect(last).toBeVisible();
    await last.click();
    await expect(
      page.locator(
        keyence ? '.kv-symbol[aria-label^="LD MR9998"]' : '.symbol[aria-label="LD M9998"]',
      ),
    ).toBeVisible();
    expect(await page.locator('.nav-item').count()).toBeLessThan(100);
    await page.locator('.search-query').fill(device + '0');
    await expect(page.locator('.nav-item.active')).toBeInViewport();
    await expect(page.locator('.nav-item.active .number')).toHaveText('001');
    expect(await page.locator('.nav-item').count()).toBeLessThan(100);
  });
}

for (const rawComparison of [true, false]) {
  test(`${rawComparison ? 'comparison CSV' : 'direct comparison'} keeps mixed-height navigation exact while scrolling and tabbing`, async ({
    page,
  }) => {
    await page.goto('/');
    const count = 256;
    const rows = Array.from({ length: count * 2 }, (_, step) => {
      const op = step % 2 ? 'OUT' : 'LD';
      const source = 'M' + step;
      const changed = step % 4 === 3;
      return { step, op, source, target: changed ? 'Y' + step : source, changed };
    });
    if (rawComparison) {
      const text =
        '行\tステップ\t照合元\tステップ\t照合先\t照合結果\n' +
        rows
          .map(({ step, op, source, target, changed }) =>
            [
              step + 1,
              step,
              op + ' ' + source,
              step,
              op + ' ' + target,
              changed ? '不一致' : '一致',
            ].join('\t'),
          )
          .join('\n');
      await drop(page, '.app', [{ name: 'compare.csv', text }]);
    } else {
      const text = (side: 'source' | 'target') =>
        'ステップ番号\t命令\tI/O(デバイス)\n' +
        rows.map((row) => [row.step, row.op, row[side]].join('\t')).join('\n');
      await comparison(page, text('source'), text('target'), 'program.csv');
    }
    const list = page.locator('.comparison-nav .nav-list');
    const button = (n: number) =>
      list
        .locator('.nav-item')
        .filter({ has: page.getByText(String(n).padStart(3, '0'), { exact: true }) });
    await expect(page.locator('.comparison-nav .panel-title span')).toHaveText(String(count));
    await expect.poll(() => list.locator('.nav-item').count()).toBeLessThan(128);
    const height = (n: number) => button(n).evaluate((el) => el.getBoundingClientRect().height);
    const pairHeight = (await height(1)) + (await height(2));
    expect(await height(2)).toBeGreaterThan(await height(1));
    expect(await list.evaluate((el) => el.scrollHeight)).toBe(Math.round((pairHeight * count) / 2));
    await list.evaluate((el, top) => {
      el.scrollTop = top;
    }, pairHeight * 78);
    await expect(button(160)).toBeInViewport();
    await button(160).focus();
    await page.keyboard.press('Tab');
    await expect(button(161)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(button(161)).toHaveClass(/active/);
    await expect(
      page.locator('.compare-scroll').first().locator('[aria-label="LD M320"]'),
    ).toBeInViewport();
  });
}
