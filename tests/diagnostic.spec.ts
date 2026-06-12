import { test } from '@playwright/test';
import { loginAs } from './helpers/auth';
import * as fs from 'fs';

test('Diagnostic - Capture HTML and Errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  const networkErrors: string[] = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(`[CONSOLE ERROR] ${msg.text()}`);
    }
  });

  page.on('response', response => {
    if (response.status() >= 400) {
      networkErrors.push(`[NETWORK ERROR] ${response.status()} - ${response.url()}`);
    }
  });

  await page.goto('/');
  await page.waitForTimeout(3000);
  
  const html = await page.content();
  fs.writeFileSync('diagnostic-html.txt', html);
  fs.writeFileSync('diagnostic-console.txt', consoleErrors.join('\n') || 'Aucune erreur console détectée.');
  fs.writeFileSync('diagnostic-network.txt', networkErrors.join('\n') || 'Aucune erreur réseau détectée.');
});
