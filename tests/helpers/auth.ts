import { type Page } from '@playwright/test';

export async function loginAs(page: Page, email: string, password: string) {
  const logs: string[] = [];
  if (process.env.PEDAGOGY_SAFE_CI !== 'true') page.on('console', msg => logs.push(`[BROWSER] ${msg.text()}`));

  const appUrl = process.env.STAGING_APP_URL;
  const vercelBypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (appUrl && vercelBypassSecret) {
    const appOrigin = new URL(appUrl).origin;
    await page.route(`${appOrigin}/**`, async route => {
      await route.continue({
        headers: { ...route.request().headers(), 'x-vercel-protection-bypass': vercelBypassSecret },
      });
    });
  }

  await page.goto('/#/login', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  
  // Remplissage du formulaire
  await page.getByTestId('login-email').fill(email, { timeout: 30_000 });
  await page.getByTestId('login-password').fill(password, { timeout: 30_000 });
  await page.getByTestId('login-submit').click({ timeout: 30_000 });

  // Attendre la redirection ou une erreur
  let result = 'timeout';
  await Promise.race([
    page.getByTestId('dashboard-page').waitFor({ state: 'visible', timeout: 15000 }).then(() => result = 'success'),
    page.getByTestId('sidebar').waitFor({ state: 'visible', timeout: 15000 }).then(() => result = 'success'),
    page.getByTestId('logout-button').waitFor({ state: 'visible', timeout: 15000 }).then(() => result = 'success'),
    page.getByTestId('login-error').waitFor({ state: 'visible', timeout: 15000 }).then(() => result = 'error')
  ]).catch(() => {
    // Timeout
  });
  
  if (result === 'timeout') {
    throw new Error(`Timeout lors de la connexion pour ${email}. Ni le dashboard ni un message d'erreur n'est apparu.\nBrowser Logs:\n${logs.join('\n')}`);
  }
  if (result === 'error') {
    const errorText = await page.getByTestId('login-error').textContent();
    throw new Error(`Échec de connexion pour ${email}: ${errorText?.trim()}`);
  }
}
