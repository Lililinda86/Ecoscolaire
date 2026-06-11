# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: login-roles.spec.ts >> Login with role: driver
- Location: tests\login-roles.spec.ts:14:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('button:has-text("Déconnexion"), button:has-text("Logout"), .lucide-log-out').first()
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for locator('button:has-text("Déconnexion"), button:has-text("Logout"), .lucide-log-out').first()

```

```yaml
- heading "EcoScolaire SaaS" [level=1]
- paragraph: Connectez-vous à votre espace
- text: Email de connexion
- textbox "Email":
  - /placeholder: "Ex: kyrialove@gmail.com"
  - text: driver.alpha@ecoscolaire.com
- text: Mot de passe (Min. 6 caractères)
- textbox "Mot de passe":
  - /placeholder: ••••••
  - text: Test@2026Alpha!
- button
- button "Mot de passe oublié ?"
- button "Se connecter"
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | const roles = [
  4  |   { name: 'owner', email: 'owner.alpha@ecoscolaire.com', pass: 'Test@2026Alpha!' },
  5  |   { name: 'director', email: 'director.alpha@ecoscolaire.com', pass: 'Test@2026Alpha!' },
  6  |   { name: 'secretary', email: 'secretary.alpha@ecoscolaire.com', pass: 'Test@2026Alpha!' },
  7  |   { name: 'accountant', email: 'accountant.alpha@ecoscolaire.com', pass: 'Test@2026Alpha!' },
  8  |   { name: 'teacher', email: 'teacher1.alpha@ecoscolaire.com', pass: 'Test@2026Alpha!' },
  9  |   { name: 'driver', email: 'driver.alpha@ecoscolaire.com', pass: 'Test@2026Alpha!' },
  10 |   { name: 'parent', email: 'parent1.alpha@ecoscolaire.com', pass: 'Test@2026Alpha!' },
  11 | ];
  12 | 
  13 | for (const role of roles) {
  14 |   test(`Login with role: ${role.name}`, async ({ page }) => {
  15 |     await page.goto('/');
  16 |     await page.getByTestId('login-email').fill(role.email);
  17 |     await page.getByTestId('login-password').fill(role.pass);
  18 |     await page.getByTestId('login-submit').click();
  19 |     
  20 |     // Check successful login by waiting for dashboard/portal to load
  21 |     // Assuming a sign-out button or specific dashboard element appears
> 22 |     await expect(page.locator('button:has-text("Déconnexion"), button:has-text("Logout"), .lucide-log-out').first()).toBeVisible({ timeout: 15000 });
     |                                                                                                                      ^ Error: expect(locator).toBeVisible() failed
  23 |   });
  24 | }
  25 | 
```