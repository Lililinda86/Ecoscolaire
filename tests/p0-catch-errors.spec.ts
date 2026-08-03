import { test } from '@playwright/test';

test('Check Console Errors on Staging', async ({ page }) => {
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

  await page.goto('https://ecoscolaire.vercel.app/', { waitUntil: 'networkidle' });
  
  console.log('Total errors caught:', errors.length);
  if (errors.length > 0) {
    console.log('FIRST ERROR:', errors[0]);
  }
});
