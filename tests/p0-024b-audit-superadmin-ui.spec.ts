import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import * as fs from 'fs';
import * as path from 'path';

import { loadStagingCredentials } from './helpers/stagingCredentials';

const { superAdminPassword } = loadStagingCredentials(['superAdmin']);

test.describe('P0-024B AUDIT E2E', () => {
  test('Audit UI and Firebase Project ID', async ({ page }) => {
    let firestoreProjectId = '';

    // Intercept requests to get the Firebase Project ID
    page.on('request', request => {
      const url = request.url();
      if (url.includes('firestore.googleapis.com/v1/projects/')) {
        const match = url.match(/projects\/([^/]+)/);
        if (match && match[1]) {
          firestoreProjectId = match[1];
        }
      }
      if (url.includes('identitytoolkit.googleapis.com')) {
        // Also capture Auth API key
        // Not strictly needed if we got firestore
      }
    });

    console.log('--- DEBUT AUDIT E2E SUR PRODUCTION ---');
    console.log('URL: https://ecoscolaire-ghd6.vercel.app/#/login');
    
    await page.goto('https://ecoscolaire-ghd6.vercel.app/#/login', { waitUntil: 'networkidle' });
    
    await loginAs(page, 'superadmin.test@ecoscolaire.com', superAdminPassword);
    
    console.log('Connexion réussie, accès au SuperAdmin...');
    
    await expect(page.locator('text=Espace Super Admin SaaS').first()).toBeVisible();
    
    await page.waitForTimeout(3000); // Give time for schools to load

    const schoolsText = await page.evaluate(() => {
      const rows = document.querySelectorAll('tr');
      const names: string[] = [];
      rows.forEach(row => {
        names.push(row.innerText.replace(/\n/g, ' | '));
      });
      return names;
    });

    console.log(`\n=== FIREBASE PROJECT USED BY APP ===\nProject ID: ${firestoreProjectId || 'NOT FOUND'}`);

    console.log('\n=== SCHOOLS VISIBLE IN UI ===');
    schoolsText.forEach(s => console.log(s));
    
    // Save output to file for the report
    fs.writeFileSync(
      path.join(__dirname, 'audit-output.txt'), 
      `ProjectID: ${firestoreProjectId}\n\nVisible Rows:\n${schoolsText.join('\n')}`
    );

    // Take screenshot
    await page.screenshot({ path: path.join(__dirname, 'audit-superadmin.png') });
  });
});
