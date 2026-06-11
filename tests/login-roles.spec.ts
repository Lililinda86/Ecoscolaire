import { test, expect } from '@playwright/test';

const roles = [
  { name: 'owner', email: 'owner.alpha@ecoscolaire.com', pass: 'Test@2026Alpha!' },
  { name: 'director', email: 'director.alpha@ecoscolaire.com', pass: 'Test@2026Alpha!' },
  { name: 'secretary', email: 'secretary.alpha@ecoscolaire.com', pass: 'Test@2026Alpha!' },
  { name: 'accountant', email: 'accountant.alpha@ecoscolaire.com', pass: 'Test@2026Alpha!' },
  { name: 'teacher', email: 'teacher1.alpha@ecoscolaire.com', pass: 'Test@2026Alpha!' },
  { name: 'driver', email: 'driver.alpha@ecoscolaire.com', pass: 'Test@2026Alpha!' },
  { name: 'parent', email: 'parent1.alpha@ecoscolaire.com', pass: 'Test@2026Alpha!' },
];

for (const role of roles) {
  test(`Login with role: ${role.name}`, async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('login-email').fill(role.email);
    await page.getByTestId('login-password').fill(role.pass);
    await page.getByTestId('login-submit').click();
    
    // Check successful login by waiting for dashboard/portal to load
    // Assuming a sign-out button or specific dashboard element appears
    await expect(page.locator('button:has-text("Déconnexion"), button:has-text("Logout"), .lucide-log-out').first()).toBeVisible({ timeout: 15000 });
  });
}
