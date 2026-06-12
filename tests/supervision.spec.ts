import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

test.describe('SuperAdmin Supervision Mode', () => {
  test.beforeEach(async ({ page }) => {
    // Connexion en tant que Super Admin
    await loginAs(page, 'superadmin.test@ecoscolaire.com', 'Test@2026Super!');
    await expect(page.locator('text=Espace Super Admin SaaS')).toBeVisible();
  });

  test('superAdmin global cannot access /students and sees SchoolContextRequired', async ({ page }) => {
    // Navigation directe
    await page.goto('/#/students');
    // Le menu latéral est visible car la route l'inclut (avant redirection/message)
    // Mais on doit voir le message d'erreur
    await expect(page.locator('text=Contexte d\'école requis')).toBeVisible();
    await expect(page.locator('text=Veuillez sélectionner une école')).toBeVisible();
  });

  test('supervision workflow', async ({ page }) => {
    // On clique sur le bouton "Accéder" (Superviser) pour la première école (ex: Alpha)
    await page.getByRole('button', { name: 'Accéder' }).first().click();
    
    // On doit arriver sur le dashboard avec les stats de l'école
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
    
    // Les menus de l'école apparaissent
    await expect(page.getByTestId('nav-students')).toBeVisible();
    
    // On va sur Élèves
    await page.getByTestId('nav-students').click();
    await expect(page.locator('h1').filter({ hasText: 'Élèves' })).toBeVisible();
    // Les données doivent s'afficher (au moins le tableau ou le bouton d'ajout)
    await expect(page.locator('text=Ajouter').first()).toBeVisible();

    // Retour Super Admin (exitSupervision)
    // Le bouton de retour super admin est dans le Layout quand on est en supervision
    // On cherche le bouton avec le texte "Retour Super Admin"
    // D'abord, vérifions si ce bouton existe dans Layout.tsx pour exitSupervision.
    const exitButton = page.locator('text=Retour Super Admin');
    // S'il n'existe pas explicitement sous ce nom, il faut utiliser l'UI existante (Red banner)
    // "MODE SUPERVISION — École"
    // "Quitter la supervision"
    await page.locator('text=Retour Super Admin').click();
    
    // On retourne sur l'espace global
    await page.goto('/#/superadmin');
    await expect(page.locator('text=Espace Super Admin SaaS')).toBeVisible();
    
    // Le menu latéral (Layout) ne doit plus inclure les liens académiques (nav-students)
    await expect(page.getByTestId('nav-students')).toBeHidden();
  });
});
