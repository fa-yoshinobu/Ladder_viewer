import { test, expect } from '@playwright/test';
import { drop } from './fixtures';

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
