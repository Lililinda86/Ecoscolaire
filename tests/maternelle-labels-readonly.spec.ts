import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('picker renders all PS MS GS francophone aliases distinctly without submission', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  const externalRequests: string[] = [];
  await page.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === '127.0.0.1' && ['GET', 'HEAD'].includes(request.method())) return route.continue();
    if (url.hostname !== 'fonts.googleapis.com') externalRequests.push(url.origin);
    return route.abort('blockedbyclient');
  });
  await page.goto('http://127.0.0.1:5187/tests/visual/maternelle-picker.html');
  const dialog = page.getByTestId('bulk-picker-dialog');
  await expect(dialog).toBeVisible();
  const rows = dialog.getByTestId('classes-scroll-container').locator('label');
  await expect(rows).toHaveCount(6);
  const options = await rows.evaluateAll(elements => elements.map(element => ({
    value: element.querySelector('input')?.value,
    label: element.querySelector('input + div > div')?.textContent?.trim() || '',
  })));
  expect(options.map(option => option.value).sort()).toEqual([
    'visual-legacy-ps', 'visual-alias-ps', 'visual-legacy-ms',
    'visual-alias-ms', 'visual-legacy-gs', 'visual-alias-gs',
  ].sort());
  expect(new Set(options.map(option => option.label)).size).toBe(6);
  for (const level of ['Petite', 'Moyenne', 'Grande']) {
    expect(options.filter(option => option.label.startsWith(`Maternelle ${level} Section · `))).toHaveLength(2);
  }
  expect(externalRequests).toEqual([]);
  await mkdir('test-results/maternelle-local', { recursive: true });
  await dialog.screenshot({ path: 'test-results/maternelle-local/08-class-program-picker.png' });
});
