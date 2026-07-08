import { test } from '@playwright/test';

test('Check Root Cause V2 on Staging', async ({ page }) => {
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

  page.on('response', response => {
    if (response.status() >= 400) {
      console.log(`HTTP ERROR: ${response.status()} ${response.url()}`);
    }
  });

  await page.goto('https://ecoscolaire.vercel.app/', { waitUntil: 'networkidle' });
  
  const content = await page.content();
  console.log('HTML length:', content.length);
  
  if (content.includes('<div id="root"></div>')) {
    console.log('Found empty root div.');
  }

  const scripts = await page.evaluate(() => {
    return Array.from(document.scripts).map(s => s.src || 'inline');
  });
  console.log('Scripts injected:', scripts);

  console.log('Total errors caught:', errors.length);
});
