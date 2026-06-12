const fs = require('fs');
const path = require('path');

const testsDir = path.join(__dirname, 'tests');
const files = fs.readdirSync(testsDir).filter(f => f.endsWith('.spec.ts'));

for (const file of files) {
  const filePath = path.join(testsDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // Ajouter l'import si pas présent
  if (!content.includes('loginAs')) {
    content = content.replace("from '@playwright/test';", "from '@playwright/test';\nimport { loginAs } from './helpers/auth';");
    changed = true;
  }

  // Expression régulière pour trouver le bloc complet de login
  // await page.goto(...);
  // await page.getByTestId('login-email').fill('EMAIL');
  // await page.getByTestId('login-password').fill('PASS');
  // await page.getByTestId('login-submit').click();

  const regex = /await page\.goto\([^)]+\);\s*await page\.getByTestId\('login-email'\)\.fill\('([^']+)'\);\s*await page\.getByTestId\('login-password'\)\.fill\('([^']+)'\);\s*await page\.getByTestId\('login-submit'\)\.click\(\);/g;

  content = content.replace(regex, (match, email, password) => {
    changed = true;
    return `await loginAs(page, '${email}', '${password}');`;
  });

  // Autre motif sans goto (dans certains cas ?)
  const regex2 = /await page\.getByTestId\('login-email'\)\.fill\('([^']+)'\);\s*await page\.getByTestId\('login-password'\)\.fill\('([^']+)'\);\s*await page\.getByTestId\('login-submit'\)\.click\(\);/g;
  content = content.replace(regex2, (match, email, password) => {
    changed = true;
    return `await loginAs(page, '${email}', '${password}');`;
  });

  if (changed) {
    fs.writeFileSync(filePath, content);
  }
}
console.log('Login refactored successfully.');
