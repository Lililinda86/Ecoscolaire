import { test, expect } from '@playwright/test';

test('Check PWA Safety Net Local Preview', async ({ page }) => {
  const errors: string[] = [];
  
  page.on('pageerror', err => {
    console.log('PAGE ERROR:', err.message);
    errors.push(err.message);
  });
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('CONSOLE ERROR:', msg.text());
      errors.push(msg.text());
    }
  });

  // Navigate to local preview
  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  
  // Check if Login is visible
  const loginText = await page.textContent('body');
  console.log("Body text includes 'Se connecter':", loginText?.includes('Se connecter'));
  
  // Test if the safety script is in the DOM
  const hasSafetyScript = await page.evaluate(() => {
    return document.head.innerHTML.includes('__ecoscolaireFatalHandler');
  });
  console.log("Safety script present:", hasSafetyScript);

  // Assertions
  expect(loginText).toContain('Se connecter');
  expect(hasSafetyScript).toBe(true);
  expect(errors.length).toBe(0);
});
