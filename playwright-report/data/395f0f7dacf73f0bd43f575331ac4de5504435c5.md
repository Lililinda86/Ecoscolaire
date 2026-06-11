# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: login-superadmin.spec.ts >> Super Admin login and dashboard access
- Location: tests\login-superadmin.spec.ts:3:1

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /.*dashboard|superadmin.*/
Received string:  "http://localhost:4173/#/login"
Timeout: 10000ms

Call log:
  - Expect "toHaveURL" with timeout 10000ms
    23 × unexpected value "http://localhost:4173/#/login"

```

```yaml
- heading "EcoScolaire SaaS" [level=1]
- paragraph: Connectez-vous à votre espace
- text: Email de connexion
- textbox "Email":
  - /placeholder: "Ex: kyrialove@gmail.com"
  - text: superadmin.test@ecoscolaire.com
- text: Mot de passe (Min. 6 caractères)
- textbox "Mot de passe":
  - /placeholder: ••••••
  - text: Test@2026Super!
- button
- button "Mot de passe oublié ?"
- button "Se connecter"
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test('Super Admin login and dashboard access', async ({ page }) => {
  4  |   await page.goto('/');
  5  |   
  6  |   await page.getByTestId('login-email').fill('superadmin.test@ecoscolaire.com');
  7  |   await page.getByTestId('login-password').fill('Test@2026Super!');
  8  |   await page.getByTestId('login-submit').click();
  9  |   
  10 |   // Verify Dashboard Super Admin visibility
  11 |   // Wait for the URL to change or specific dashboard elements
> 12 |   await expect(page).toHaveURL(/.*dashboard|superadmin.*/, { timeout: 10000 });
     |                      ^ Error: expect(page).toHaveURL(expected) failed
  13 |   await expect(page.locator('text=Super Admin').first()).toBeVisible();
  14 | });
  15 | 
```