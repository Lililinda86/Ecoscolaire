# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: multitenant-alpha-beta.spec.ts >> Multi-tenant isolation: Alpha owner cannot see Beta students
- Location: tests\multitenant-alpha-beta.spec.ts:3:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('text=Élèves')

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - generic [ref=e5]:
    - img [ref=e7]
    - heading "EcoScolaire SaaS" [level=1] [ref=e10]
    - paragraph [ref=e11]: Connectez-vous à votre espace
  - generic [ref=e12]:
    - generic [ref=e13]:
      - generic [ref=e14]: Email de connexion
      - generic [ref=e15]:
        - img [ref=e16]
        - textbox "Email" [ref=e19]:
          - /placeholder: "Ex: kyrialove@gmail.com"
          - text: owner.alpha@ecoscolaire.com
    - generic [ref=e20]:
      - generic [ref=e21]: Mot de passe (Min. 6 caractères)
      - generic [ref=e22]:
        - img [ref=e23]
        - textbox "Mot de passe" [ref=e26]:
          - /placeholder: ••••••
          - text: Test@2026Alpha!
        - button [ref=e27] [cursor=pointer]:
          - img [ref=e28]
    - button "Mot de passe oublié ?" [ref=e32] [cursor=pointer]
    - button "Se connecter" [ref=e33] [cursor=pointer]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test('Multi-tenant isolation: Alpha owner cannot see Beta students', async ({ page }) => {
  4  |   await page.goto('/');
  5  |   await page.getByTestId('login-email').fill('owner.alpha@ecoscolaire.com');
  6  |   await page.getByTestId('login-password').fill('Test@2026Alpha!');
  7  |   await page.getByTestId('login-submit').click();
  8  |   
  9  |   // Go to students section
> 10 |   await page.locator('text=Élèves').click();
     |                                     ^ Error: locator.click: Test timeout of 30000ms exceeded.
  11 |   
  12 |   // Wait for the table to load
  13 |   await page.waitForTimeout(2000);
  14 |   
  15 |   // Check that at least one Alpha student exists and no Beta mentions
  16 |   const pageText = await page.content();
  17 |   expect(pageText).toContain('TestAlpha');
  18 |   expect(pageText).not.toContain('Beta');
  19 | });
  20 | 
  21 | test('Multi-tenant isolation: Beta owner cannot see Alpha students', async ({ page }) => {
  22 |   await page.goto('/');
  23 |   await page.getByTestId('login-email').fill('owner.beta@ecoscolaire.com');
  24 |   await page.getByTestId('login-password').fill('Test@2026Beta!');
  25 |   await page.getByTestId('login-submit').click();
  26 |   
  27 |   await page.locator('text=Élèves').click();
  28 |   await page.waitForTimeout(2000);
  29 |   
  30 |   const pageText = await page.content();
  31 |   expect(pageText).not.toContain('TestAlpha');
  32 | });
  33 | 
```