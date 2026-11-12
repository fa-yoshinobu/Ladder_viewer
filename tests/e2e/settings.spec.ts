import { test, expect } from '@playwright/test';
import { gx, mnm, comments, script, drop, comparison } from './fixtures';

test('display settings survive reload and are shared across all three screens', async ({
  page,
}) => {
  await page.goto('/');
  const open = async (keyence: boolean) =>
    drop(page, '.app', [
      { name: keyence ? 'synthetic.mnm' : 'synthetic.csv', text: keyence ? mnm : gx },
      { name: 'comment.csv', text: comments(keyence, 'Synthetic ') },
    ]);
  await open(false);
  await expect(page.locator('.symbol[aria-label="LD M60"]')).toBeVisible();
  await page.getByRole('button', { name: '幅に合わせる', exact: true }).click();
  const zoom = page.locator('.subbar button').filter({ hasText: /^\d+%$/ });
  const initialZoom = await zoom.textContent();
  await page.getByLabel('長い回路の表示', { exact: true }).selectOption('scroll');
  await page.getByLabel('コメント', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'ダークモード', exact: true }).click();
  await page.getByLabel('ラダー配色（ダークモード）').selectOption('blue');
  await page.getByRole('button', { name: '拡大', exact: true }).click();
  await page.reload();
  await open(false);
  await expect(zoom).toHaveText(initialZoom ?? '');
  await expect(page.getByLabel('長い回路の表示', { exact: true })).toHaveValue('scroll');
  await expect(page.getByLabel('コメント', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('ラダー配色（ダークモード）')).toHaveValue('blue');
  await open(true);
  await expect(page.getByLabel('長い回路の表示', { exact: true })).toHaveValue('scroll');
  await expect(page.getByLabel('コメント', { exact: true })).not.toBeChecked();
  await comparison(page, gx, gx, 'synthetic.csv');
  await expect(page.getByLabel('長い回路の表示', { exact: true })).toHaveValue('scroll');
  await expect(page.getByLabel('コメント', { exact: true })).not.toBeChecked();
  await page.getByLabel('長い回路の表示', { exact: true }).selectOption('wrap');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('viewMode'))).toBe('wrap');
  const saved = await page.evaluate(() => Object.keys(localStorage));
  expect(saved.some((key) => /zoom/i.test(key))).toBe(false);
  await page.reload();
  await drop(page, '.app', [{ name: 'synthetic.mnm', text: script() }]);
  await page.getByLabel('ST色分け', { exact: true }).check();
  await page.reload();
  await drop(page, '.app', [{ name: 'synthetic.mnm', text: script() }]);
  await expect(page.getByLabel('ST色分け', { exact: true })).toBeChecked();
});
