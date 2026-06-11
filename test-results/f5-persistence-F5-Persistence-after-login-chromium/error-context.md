# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: f5-persistence.spec.ts >> F5 Persistence after login
- Location: tests\f5-persistence.spec.ts:3:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('button:has-text("Déconnexion"), button:has-text("Logout"), .lucide-log-out').first()
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('button:has-text("Déconnexion"), button:has-text("Logout"), .lucide-log-out').first()

```

```yaml
- heading "EcoScolaire SaaS" [level=1]
- paragraph: Connectez-vous à votre espace
- text: Email de connexion
- textbox "Email":
  - /placeholder: "Ex: kyrialove@gmail.com"
- text: Mot de passe (Min. 6 caractères)
- textbox "Mot de passe":
  - /placeholder: ••••••
- button
- button "Mot de passe oublié ?"
- button "Se connecter"
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test('F5 Persistence after login', async ({ page }) => {
  4  |   await page.goto('/');
  5  |   await page.getByTestId('login-email').fill('owner.alpha@ecoscolaire.com');
  6  |   await page.getByTestId('login-password').fill('Test@2026Alpha!');
  7  |   await page.getByTestId('login-submit').click();
  8  |   
  9  |   await page.waitForTimeout(2000);
  10 |   await page.reload();
  11 |   
  12 |   // Verify we are still logged in
> 13 |   await expect(page.locator('button:has-text("Déconnexion"), button:has-text("Logout"), .lucide-log-out').first()).toBeVisible({ timeout: 10000 });
     |                                                                                                                    ^ Error: expect(locator).toBeVisible() failed
  14 | });
  15 | 
```