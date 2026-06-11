# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: students-crud.spec.ts >> Students CRUD >> Create, modify, and delete a student
- Location: tests\students-crud.spec.ts:12:3

# Error details

```
Test timeout of 30000ms exceeded while running "beforeEach" hook.
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
          - text: secretary.alpha@ecoscolaire.com
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
  3  | test.describe('Students CRUD', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.goto('/');
  6  |     await page.getByTestId('login-email').fill('secretary.alpha@ecoscolaire.com');
  7  |     await page.getByTestId('login-password').fill('Test@2026Alpha!');
  8  |     await page.getByTestId('login-submit').click();
> 9  |     await page.locator('text=Élèves').click();
     |                                       ^ Error: locator.click: Test timeout of 30000ms exceeded.
  10 |   });
  11 | 
  12 |   test('Create, modify, and delete a student', async ({ page }) => {
  13 |     // Check if adding is possible (button usually has 'Ajouter' or '+')
  14 |     const addButton = page.locator('button', { hasText: /(Ajouter|Nouveau|\+)/i }).first();
  15 |     if (await addButton.isVisible()) {
  16 |       await addButton.click();
  17 |       // Try to fill generic fields
  18 |       const firstNameInput = page.locator('input[name="firstName"], input[placeholder*="Prénom"]');
  19 |       if (await firstNameInput.isVisible()) {
  20 |         await firstNameInput.fill('TestE2E');
  21 |         await page.locator('input[name="lastName"], input[placeholder*="Nom"]').fill('Student');
  22 |         await page.locator('button[type="submit"], button:has-text("Enregistrer")').click();
  23 |         
  24 |         await expect(page.locator('text=TestE2E')).toBeVisible();
  25 |       }
  26 |     }
  27 |   });
  28 | });
  29 | 
```