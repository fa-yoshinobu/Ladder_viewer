import { test, expect } from '@playwright/test';
import { gx, mnm, comments, drop } from './fixtures';

for (const keyence of [false, true]) {
  test(`${keyence ? 'KEYENCE' : 'Mitsubishi'} keeps its circuit position when comments change`, async ({
    page,
  }) => {
    await page.goto('/');
    const commands = Array.from({ length: 100 }, (_, i) =>
      keyence
        ? `LD MR${i * 2}\nOUT MR${i * 2 + 1}`
        : `${i * 2}\tLD\tM${i * 2}\n${i * 2 + 1}\tOUT\tM${i * 2 + 1}`,
    ).join('\n');
    await drop(page, '.app', [
      {
        name: keyence ? 'synthetic.mnm' : 'synthetic.csv',
        text: keyence
          ? 'DEVICE:57\n;MODULE:Synthetic\n' + commands + '\nEND'
          : 'ステップ番号\t命令\tI/O(デバイス)\n' + commands,
      },
      { name: 'comment.csv', text: comments(keyence, 'Synthetic ') },
    ]);
    await page.locator('.search-query').fill('LD');
    await expect(page.locator('.search-count')).toHaveText('1/100');
    for (let i = 0; i < 20; i++) await page.getByRole('button', { name: '次の検索結果' }).click();
    await expect(page.locator('.search-count')).toHaveText('21/100');
    const anchor = () =>
      page.locator(keyence ? '.kv-diagram' : '.diagram').evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return [...element.querySelectorAll('svg[aria-label]')]
          .find((svg) => svg.getBoundingClientRect().bottom > bounds.top + 2)
          ?.getAttribute('aria-label');
      });
    const before = await anchor();
    await page.getByLabel('コメント', { exact: true }).uncheck();
    await expect.poll(anchor).toBe(before);
  });
  test(`${keyence ? 'KEYENCE' : 'Mitsubishi'} distinguishes partial-load warnings from errors`, async ({
    page,
  }) => {
    await page.goto('/');
    await drop(page, '.app', [
      { name: keyence ? 'synthetic.mnm' : 'synthetic.csv', text: keyence ? mnm : gx },
      { name: 'invalid.csv', text: 'synthetic invalid input' },
    ]);
    await expect(page.locator('.warning')).toContainText('invalid.csv');
    await expect(page.locator('.error')).toHaveCount(0);
    await page.getByRole('button', { name: '警告を閉じる' }).click();
    await expect(page.locator('.warning')).toHaveCount(0);
    await drop(page, '.app', [{ name: 'invalid.csv', text: 'synthetic invalid input' }]);
    await expect(page.locator('.error')).toContainText('invalid.csv');
    await page.getByRole('button', { name: 'エラーを閉じる' }).click();
    await expect(page.locator('.error')).toHaveCount(0);
  });

  test(`${keyence ? 'KEYENCE' : 'Mitsubishi'} waits until search input settles`, async ({
    page,
  }) => {
    await page.clock.install();
    await page.goto('/');
    await drop(page, '.app', [
      { name: keyence ? 'synthetic.mnm' : 'synthetic.csv', text: keyence ? mnm : gx },
    ]);
    await expect(page.locator(keyence ? '.kv-symbol' : '.symbol').first()).toBeVisible();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    const query = page.locator('.search-query');
    await query.fill(keyence ? 'MR60' : 'M60');
    await page.clock.runFor(100);
    await expect(page.locator('.search-count')).toHaveText('0/0');
    await query.fill(keyence ? 'MR80' : 'M80');
    await page.clock.runFor(179);
    await expect(page.locator('.search-count')).toHaveText('0/0');
    // Advance past the debounce and the render effects while the clock is paused.
    await page.clock.runFor(200);
    await expect(page.locator('.search-count')).toHaveText('1/1');
    await expect(page.locator(keyence ? '.kv-symbol.selected' : '.symbol.chosen')).toHaveAttribute(
      'aria-label',
      new RegExp(keyence ? 'MR80' : 'M80'),
    );
  });
}

for (const rawComparison of [false, true])
  test(`${rawComparison ? 'comparison CSV' : 'direct comparison'} keeps the current circuit when comments and displayed sides change`, async ({
    page,
  }) => {
    await page.goto('/');
    const text =
      'ステップ番号\t命令\tI/O(デバイス)\n' +
      Array.from(
        { length: 100 },
        (_, i) => `${i * 2}\tLD\tM${i * 2}\n${i * 2 + 1}\tOUT\tM${i * 2 + 1}`,
      ).join('\n');
    if (rawComparison) {
      const rows = Array.from(
        { length: 200 },
        (_, i) =>
          `${i + 1}\t${i}\t${i % 2 ? 'OUT' : 'LD'} M${i}\t${i}\t${i % 2 ? 'OUT' : 'LD'} M${i}\t一致`,
      );
      await drop(page, '.app', [
        {
          name: 'synthetic-comparison.csv',
          text: '行\tステップ\t照合元\tステップ\t照合先\t照合結果\n' + rows.join('\n'),
        },
        { name: 'comment.csv', text: comments(false, 'Synthetic ') },
      ]);
    } else {
      await page.getByRole('button', { name: '比較モード', exact: true }).click();
      for (const side of ['source', 'target']) {
        await drop(page, `.direct-input[data-side="${side}"]`, [
          { name: 'synthetic.csv', text },
          { name: 'comment.csv', text: comments(false, 'Synthetic ') },
          ...(side === 'source' ? [{ name: 'invalid.csv', text: 'synthetic invalid input' }] : []),
        ]);
        await expect(page.locator('.direct-comparison-app')).toHaveAttribute(
          `data-${side}-status`,
          'ready',
        );
        if (side === 'source') {
          await expect(page.locator('.direct-input[data-side="source"] .warning')).toContainText(
            'invalid.csv',
          );
          await page.getByRole('button', { name: '警告を閉じる' }).click();
        }
      }
    }
    await page.locator('.search-query').fill('LD');
    await expect(page.locator('.search-count')).toHaveText('1/200');
    for (let i = 0; i < 20; i++) await page.getByRole('button', { name: '次の検索結果' }).click();
    await expect(page.locator('.search-count')).toHaveText('21/200');
    const anchor = () =>
      page
        .locator('.compare-scroll:visible, .diagram:visible')
        .first()
        .evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return [...element.querySelectorAll('svg[aria-label]')]
            .find((svg) => svg.getBoundingClientRect().bottom > bounds.top + 2)
            ?.getAttribute('aria-label');
        });
    const before = await anchor();
    expect(before).not.toContain('ステップ0');
    await page.getByLabel('コメント', { exact: true }).uncheck();
    await expect.poll(anchor).toBe(before);
    await page.getByLabel('比較の表示', { exact: true }).selectOption('source');
    await expect.poll(anchor).toBe(before);
    await page.getByLabel('比較の表示', { exact: true }).selectOption('target');
    await expect.poll(anchor).toBe(before);
    await page.getByLabel('比較の表示', { exact: true }).selectOption('both');
    await expect.poll(anchor).toBe(before);
  });
