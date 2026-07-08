import { test, expect } from '@playwright/test';

test('Test Production Post Deployment', async ({ page }) => {
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

  const response = await page.goto('https://ecoscolaire.vercel.app/', { waitUntil: 'networkidle' });
  
  console.log('Status code:', response?.status());

  const loginText = await page.textContent('body');
  const isLoginVisible = loginText?.includes('Se connecter') || loginText?.includes('Connectez-vous');
  console.log("Login visible:", isLoginVisible);

  const hasSafetyScript = await page.evaluate(() => {
    return document.head.innerHTML.includes('handleFatalError') || document.head.innerHTML.includes('__ecoscolaireFatalHandler');
  });
  console.log("Safety script present:", hasSafetyScript);

  // Check SW status
  const swState = await page.evaluate(async () => {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      return reg ? (reg.active ? reg.active.state : 'No active SW') : 'No SW registered';
    }
    return 'SW not supported';
  });
  console.log("Service Worker State:", swState);

  expect(isLoginVisible).toBe(true);
  expect(hasSafetyScript).toBe(true);
  expect(errors.length).toBe(0);
});
