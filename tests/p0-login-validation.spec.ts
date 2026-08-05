import { test, expect } from '@playwright/test';

test.describe('Login Validation Security', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept API calls to Firebase Auth to simulate responses
    await page.route('**/identitytoolkit.googleapis.com/**', async (route) => {
      const postData = route.request().postDataJSON();
      
      if (!postData) {
        return route.continue();
      }

      const email = postData.email;

      // Handle specific scenarios based on email input
      
      if (email === 'invalid@example.com') {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 400,
              message: 'INVALID_LOGIN_CREDENTIALS',
              errors: [{ reason: 'invalid' }]
            }
          })
        });
      }

      if (email === 'bad-email@example.com') {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 400,
              message: 'INVALID_EMAIL',
              errors: [{ reason: 'invalid' }]
            }
          })
        });
      }

      if (email === 'disabled@example.com') {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 400,
              message: 'USER_DISABLED',
              errors: [{ reason: 'invalid' }]
            }
          })
        });
      }

      if (email === 'too-many@example.com') {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 400,
              message: 'TOO_MANY_ATTEMPTS_TRY_LATER',
              errors: [{ reason: 'invalid' }]
            }
          })
        });
      }

      if (email === 'network@example.com') {
        return route.abort('failed');
      }

      // Default mock success response if needed, or let it fail for real tests
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 400,
            message: 'INVALID_LOGIN_CREDENTIALS',
          }
        })
      });
    });

    await page.goto('/#/login');
  });

  test('normalizes email (spaces before/after, uppercase) and checks exact password', async ({ page }) => {
    let interceptedEmail = '';
    let interceptedPassword = '';

    await page.route('**/identitytoolkit.googleapis.com/**', async (route) => {
      const data = route.request().postDataJSON();
      interceptedEmail = data?.email || '';
      interceptedPassword = data?.password || '';
      return route.fulfill({ status: 400, body: JSON.stringify({ error: { message: 'INVALID_LOGIN_CREDENTIALS' } }) });
    });

    // Disable HTML5 validation to allow leading/trailing spaces to reach our React onSubmit handler
    await page.evaluate(() => {
      const form = document.querySelector('form');
      if (form) form.noValidate = true;
    });

    await page.fill('input[name="email"]', '  SeCreTary@EcoScolaire.com  ');
    // Password with space to ensure it's NOT trimmed
    await page.fill('input[name="password"]', ' mypass 123 ');
    await page.click('button[type="submit"]');

    await page.waitForResponse('**/identitytoolkit.googleapis.com/**');

    // Email must be trimmed and lowercased
    expect(interceptedEmail).toBe('secretary@ecoscolaire.com');
    // Password must be EXACTLY as entered
    expect(interceptedPassword).toBe(' mypass 123 ');
  });

  test('handles invalid-credential error without alert', async ({ page }) => {
    let alertCount = 0;
    page.on('dialog', () => alertCount++);

    await page.fill('input[name="email"]', 'invalid@example.com');
    await page.fill('input[name="password"]', 'wrongpass');
    await page.click('button[type="submit"]');

    const errorBox = page.locator('[data-testid="login-error"]');
    await expect(errorBox).toBeVisible();
    await expect(errorBox).toHaveText('Email ou mot de passe incorrect.');
    expect(alertCount).toBe(0);
  });

  test('handles invalid-email error', async ({ page }) => {
    await page.fill('input[name="email"]', 'bad-email@example.com');
    await page.fill('input[name="password"]', 'pass123');
    await page.click('button[type="submit"]');

    const errorBox = page.locator('[data-testid="login-error"]');
    await expect(errorBox).toBeVisible();
    await expect(errorBox).toHaveText("L'adresse e-mail saisie n'est pas valide.");
  });

  test('handles user-disabled error', async ({ page }) => {
    await page.fill('input[name="email"]', 'disabled@example.com');
    await page.fill('input[name="password"]', 'pass123');
    await page.click('button[type="submit"]');

    const errorBox = page.locator('[data-testid="login-error"]');
    await expect(errorBox).toBeVisible();
    await expect(errorBox).toHaveText("Ce compte a été désactivé. Contactez l'administration.");
  });

  test('handles too-many-requests error', async ({ page }) => {
    await page.fill('input[name="email"]', 'too-many@example.com');
    await page.fill('input[name="password"]', 'pass123');
    await page.click('button[type="submit"]');

    const errorBox = page.locator('[data-testid="login-error"]');
    await expect(errorBox).toBeVisible();
    await expect(errorBox).toHaveText("Trop de tentatives ont été effectuées. Réessayez plus tard.");
  });

  test('handles network-error', async ({ page }) => {
    await page.fill('input[name="email"]', 'network@example.com');
    await page.fill('input[name="password"]', 'pass123');
    await page.click('button[type="submit"]');

    const errorBox = page.locator('[data-testid="login-error"]');
    await expect(errorBox).toBeVisible();
    await expect(errorBox).toHaveText("Connexion réseau impossible. Vérifiez votre connexion Internet.");
  });

  test('ensures only one error message is visible', async ({ page }) => {
    await page.fill('input[name="email"]', 'invalid@example.com');
    await page.fill('input[name="password"]', 'pass123');
    await page.click('button[type="submit"]');

    // Wait for the error box to appear
    const errorBox = page.locator('[data-testid="login-error"]');
    await expect(errorBox).toBeVisible();

    // Make sure we only have one error element
    await expect(page.locator('[data-testid="login-error"]')).toHaveCount(1);
    
    // Make sure it does NOT contain the ambiguous message
    const errorText = await errorBox.textContent();
    expect(errorText).not.toContain('Identifiants incorrects ou accès refusé.');
  });
});
