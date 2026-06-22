import { test, expect } from '@playwright/test';

test.describe('P0-029: Parent-Student Linking', () => {
  // Assuming test data contains a student with parentEmails: ['parent1.alpha@ecoscolaire.com']
  // The test will log in as parent1.alpha@ecoscolaire.com and expect to see the student.
  
  test('Parent sees newly linked student by email', async ({ page }) => {
    // 1. Log in as secretary
    await page.goto('/#/login');
    await page.fill('input[type="email"]', 'secretary.alpha@ecoscolaire.com');
    await page.fill('input[type="password"]', 'Test@2026Alpha!');
    await page.click('button:has-text("Se connecter")');
    await page.waitForURL('**/dashboard');
    
    // 2. Create student with email parent1.alpha@ecoscolaire.com
    await page.click('a:has-text("Élèves")');
    await page.waitForSelector('button:has-text("Ajouter")');
    await page.click('button:has-text("Ajouter")');
    
    const uniqueMatricule = 'P0-029-' + Date.now().toString().slice(-5);
    await page.fill('input[placeholder="Ex: MAT-001"]', uniqueMatricule);
    await page.fill('input[required]', 'Test Élève Lié ' + uniqueMatricule); // Nom
    await page.selectOption('select', { index: 1 }); // Sexe
    await page.fill('input[type="date"]', '2015-01-01');
    await page.selectOption('select:has(option[value="francophone"])', 'francophone');
    
    // Attendre que les classes chargent
    await page.waitForTimeout(500);
    // Sélectionner la deuxième classe (index 1)
    await page.locator('select').nth(2).selectOption({ index: 1 });

    await page.fill('input[value=""]:near(label:has-text("Tuteur"))', 'Tuteur Test');
    await page.fill('input[placeholder="email1@test.com, email2@test.com"]', 'parent1.alpha@ecoscolaire.com');
    
    await page.click('button:has-text("Enregistrer")');
    
    // Attendre la sauvegarde
    await page.waitForTimeout(1000);
    
    // 3. Déconnexion
    await page.goto('/#/login');
    await page.waitForTimeout(500);

    // 4. Connexion Parent
    await page.fill('input[type="email"]', 'parent1.alpha@ecoscolaire.com');
    await page.fill('input[type="password"]', 'Test@2026Alpha!');
    await page.click('button:has-text("Se connecter")');
    
    await page.waitForURL('**/parent');
    await page.waitForTimeout(1000);
    
    // Vérifier que le nouvel élève s'affiche
    const content = await page.content();
    expect(content.includes(uniqueMatricule)).toBeTruthy();
  });
});
