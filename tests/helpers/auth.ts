import { type Page } from '@playwright/test';

export async function loginAs(page: Page, email: string, password: string) {
  const logs: string[] = [];
  page.on('console', msg => logs.push(`[BROWSER] ${msg.text()}`));

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
