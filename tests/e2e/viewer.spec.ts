import { test, expect, type Page } from '@playwright/test';
import { gx, mnm, comments, script, drop, comparison } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

for (const keyence of [false, true]) {
  test(`${keyence ? 'KEYENCE' : 'Mitsubishi'} comparison comment list uses the selected side`, async ({
    page,
    context,
  }) => {
    const text = keyence ? mnm : gx;
    const name = keyence ? 'synthetic.mnm' : 'synthetic.csv';
    const address = keyence ? 'MR60' : 'M60';
    await page.getByRole('button', { name: '比較モード', exact: true }).click();
    for (const side of ['source', 'target']) {
      await drop(page, `.direct-input[data-side="${side}"]`, [
        { name, text },
        { name: 'comment.csv', text: comments(keyence, side + ' ') },
      ]);
      await expect(page.locator('.direct-comparison-app')).toHaveAttribute(
        `data-${side}-status`,
        'ready',
      );
    }
    const symbol = keyence ? '.kv-symbol[aria-label^="LD MR60"]' : '.symbol[aria-label="LD M60"]';
    await page.locator(`.compare-column[data-side="target"] ${symbol}`).click({ button: 'right' });
    const opened = context.waitForEvent('page');
    await page.getByRole('menuitem', { name: 'コメントリスト', exact: true }).click();
    const popup = await opened;
    await expect(popup.locator('tr[data-selected="true"] td').first()).toHaveText(address);
    await popup.getByRole('button', { name: 'すべてコピー', exact: true }).click();
    const copied = await popup.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain(`${address}\ttarget 60`);
    expect(copied).not.toContain('source 60');
    await popup.close();
  });
  test(`${keyence ? 'KEYENCE' : 'Mitsubishi'} circuits do not overlap and comments copy`, async ({
    page,
    context,
  }) => {
    const text = keyence ? mnm : gx;
    const address = keyence ? 'MR60' : 'M60';
    const symbol = keyence ? '.kv-symbol[aria-label^="LD MR60"]' : '.symbol[aria-label="LD M60"]';
    await drop(page, '.app', [
      { name: keyence ? 'synthetic.mnm' : 'synthetic.csv', text },
      { name: 'comment.csv', text: comments(keyence, 'Synthetic ') },
    ]);
    await expect(page.locator(symbol)).toBeVisible();
    const networks = page.locator(keyence ? '.kv-network' : '.network');
    await expect(networks).toHaveCount(keyence ? 3 : 2);
    const diagramHeights = await networks
      .locator('svg')
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
    expect(
      diagramHeights.every((height) => height > 20),
      'each diagram reserves its drawing height',
    ).toBe(true);
    // Measure painted SVG bounds as well as containers: a broken height can leave
    // containers disjoint while their overflowing diagrams overlap.
    const bounds = await networks.evaluateAll((nodes) =>
      nodes.map((node) => {
        const rects = [node, ...node.querySelectorAll('svg')].map((el) =>
          el.getBoundingClientRect(),
        );
        return {
          top: Math.min(...rects.map((r) => r.top)),
          bottom: Math.max(...rects.map((r) => r.bottom)),
        };
      }),
    );
    for (let i = 1; i < bounds.length; i++)
      expect(bounds[i].top).toBeGreaterThanOrEqual(bounds[i - 1].bottom - 1);
    await page.locator(symbol).click({ button: 'right' });
    const opened = context.waitForEvent('page');
    await page.getByRole('menuitem', { name: 'コメントリスト', exact: true }).click();
    const popup = await opened;
    const selected = popup.locator('tr[data-selected="true"]');
    await expect(selected.locator('td').first()).toHaveText(address);
    await expect(selected.first()).toBeInViewport();
    await popup.getByRole('button', { name: 'すべてコピー', exact: true }).click();
    expect(await popup.evaluate(() => navigator.clipboard.readText())).toContain(
      `${address}\tSynthetic 60`,
    );
    await popup.close();
  });
}

async function controls(page: Page, selector: string, query: string) {
  await expect(page.locator(selector).first()).toBeVisible();
  await page.getByRole('button', { name: '幅に合わせる', exact: true }).click();
  await page.getByRole('button', { name: '拡大', exact: true }).click();
  const percent = await page
    .locator('.subbar button')
    .filter({ hasText: /^\d+%$/ })
    .textContent();
  expect(parseInt(percent ?? '') % 10).toBe(0);
  await page.getByRole('button', { name: '縮小', exact: true }).click();
  await page.keyboard.press('Control+f');
  await expect(page.locator('.search-query')).toBeFocused();
  await page.locator('.search-query').fill(query);
  await expect(page.locator('.search-count')).toContainText('1/');
  await page.keyboard.press('Enter');
  await page.locator('.search-query').fill('');
  await page.locator(selector).first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'コピー', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(query);
}
test('shared controls work in all three screens without runtime errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await drop(page, '.app', [{ name: 'synthetic.csv', text: gx }]);
  await controls(page, '.symbol[aria-label="LD M60"]', 'M60');
  await drop(page, '.app', [{ name: 'synthetic.mnm', text: mnm }]);
  await controls(page, '.kv-symbol[aria-label^="LD MR60"]', 'MR60');
  await comparison(page, gx, gx.replace('M61', 'M62'), 'synthetic.csv');
  await controls(page, '.symbol[aria-label="LD M60"]', 'M60');
  expect(errors).toEqual([]);
});

test('synthetic legacy script expands, collapses and reveals search hits', async ({ page }) => {
  await drop(page, '.app', [{ name: 'synthetic.mnm', text: script() }]);
  const expand = page.getByRole('button', { name: 'スクリプトを展開', exact: true });
  await expect(expand).toBeVisible();
  await expect(page.locator('.kv-script-range')).toHaveCount(0);
  await page.locator('.kv-symbol[aria-label^="BOX_ST"]').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'コピー', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    'DummyTotal = DummyInput',
  );
  await expand.click();
  await expect(page.locator('.kv-script-range')).toHaveCount(3);
  await expect(page.locator('.kv-script-range[data-range-start="true"]')).toHaveCount(1);
  await expect(page.locator('.kv-script-range[data-range-end="true"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'スクリプトを折りたたむ', exact: true }).press('Enter');
  await expect(page.locator('.kv-script-range')).toHaveCount(0);
  await page.getByRole('searchbox', { name: '検索', exact: true }).fill('LDA');
  await expect(page.locator('.kv-symbol.selected[aria-label^="LDA"]')).toBeVisible();
  await drop(page, '.keyence-app', [
    { name: 'a.mnm', text: script() },
    { name: 'b.mnm', text: script(19) },
  ]);
  await page.getByRole('searchbox', { name: '検索', exact: true }).fill('ADD');
  await expect(page.locator('.kv-symbol.selected[aria-label^="ADD #17"]')).toBeVisible();
  await page.getByLabel('プログラム', { exact: true }).selectOption('b.mnm');
  await expect(page.locator('.kv-symbol.selected[aria-label^="ADD #19"]')).toBeVisible();
});

test('comparison synchronizes script expansion and preserves compiled differences', async ({
  page,
}) => {
  await comparison(page, script(), script(19), 'synthetic.mnm');
  await expect(page.locator('.kv-script-toggle[aria-expanded="false"]')).toHaveCount(2);
  await expect(
    page.locator('.compare-column[data-side="source"] .kv-symbol[aria-label^="BOX_ST"] > title'),
  ).toContainText('展開命令に差分');
  await page.locator('.compare-column[data-side="source"] .kv-script-toggle').click();
  await expect(page.locator('.kv-script-toggle[aria-expanded="true"]')).toHaveCount(2);
  await page.locator('.compare-column[data-side="target"] .kv-script-toggle').click();
  await expect(page.locator('.kv-script-range')).toHaveCount(0);
  await page.getByRole('searchbox', { name: '検索', exact: true }).fill('ADD #19');
  await expect(
    page.locator('.compare-column[data-side="target"] .kv-symbol.selected[aria-label^="ADD"]'),
  ).toBeVisible();
  await expect(page.locator('.kv-script-toggle[aria-expanded="true"]')).toHaveCount(2);
  await page.getByRole('searchbox', { name: '検索', exact: true }).fill('ADD');
  await drop(page, '.direct-input[data-side="source"]', [
    { name: 'synthetic.mnm', text: script(21) },
  ]);
  await expect(
    page.locator('.compare-column[data-side="source"] .kv-symbol.selected[aria-label^="ADD #21"]'),
  ).toBeVisible();
});
