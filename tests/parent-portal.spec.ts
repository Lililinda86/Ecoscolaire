import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { attachConsoleMonitor } from './helpers/console-monitor';

test('Parent Portal - Visibility and Blockage', async ({ page }) => {
  const monitor = attachConsoleMonitor(page);
  await loginAs(page, 'parent1.alpha@ecoscolaire.com', 'Test@2026Alpha!');
  
  await page.waitForTimeout(2000);
  const pageText = await page.content();
  
  // They should not see beta students or all students
  expect(pageText).not.toContain('Beta');
  monitor.assertNoCriticalErrors();
});
