import { test } from '@playwright/test';

test('Check Broken Deployment', async ({ page }) => {
  const errors: string[] = [];
  
  page.on('pageerror', err => {
    console.log('PAGE ERROR:', err.message);
    console.log('STACK:', err.stack);
    errors.push(err.message);
  });
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('CONSOLE ERROR:', msg.text());
      errors.push(msg.text());
    }
  });

  await page.goto('https://ecoscolaire-f20a4p7ci-linda-lemofouet-s-projects.vercel.app/', { waitUntil: 'networkidle' });
  console.log('Total errors caught:', errors.length);
});
