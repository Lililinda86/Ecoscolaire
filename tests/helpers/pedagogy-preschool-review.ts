import { expect, type Page } from '@playwright/test';
import type { Firestore } from 'firebase-admin/firestore';

/** Real UI/Functions writes on a disposable synthetic tenant. No numeric preschool
 * assessment and no real teacher decision. Stored upstream states are fixtures. */
export async function verifyPreschoolReview(page: Page, db: Firestore, f: { schoolId: string; teacherId: string; pupilIds: string[] }) {
  page.setDefaultTimeout(20_000);
  await page.goto('/#/pedagogy/observations');
  await expect(page.getByRole('heading', { name: 'Activités et observations' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Activité enseignée', exact: true }).selectOption(`${f.schoolId}-prep-math`);
  await page.getByLabel('Objectif observable, extrait exact du contenu confirmé').fill('Synthetic objective');
  await page.getByRole('combobox', { name: 'Enseignant déclarant', exact: true }).selectOption(f.teacherId);
  await page.getByLabel('Date d’observation').fill('2026-09-02');
  await page.getByRole('checkbox', { name: 'Synthetic pupil 1', exact: true }).check();
  await page.getByRole('combobox', { name: 'Observation pour Synthetic pupil 1', exact: true }).selectOption('developing');
  await page.getByLabel('Contexte pour Synthetic pupil 1').fill('Entirely synthetic observed activity; not a real teacher assessment.');
  await page.getByRole('checkbox', { name: 'Ces observations m’ont été transmises par l’enseignant sélectionné.' }).check();
  await page.getByRole('button', { name: 'Enregistrer les observations', exact: true }).click();
  await expect(page.getByText('Observations enregistrées avec la provenance de l’enseignant.')).toBeVisible();
  const observations = await db.collection('pedagogyObservations').where('schoolId', '==', f.schoolId).get();
  expect(observations.size).toBe(1);
  const observation = observations.docs[0];
  expect(observation.data().score).toBeUndefined();
  expect(observation.data().state).toBe('developing');
  expect(observation.data().policySnapshot.assessmentMode).toBe('observation');
  await page.goto('/#/pedagogy/follow-up');
  await expect(page.getByRole('heading', { name: 'Suivi individuel et remédiation' })).toBeVisible();
  await page.getByText('Proposer une activité ciblée', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Preuve initiale', exact: true }).selectOption('observation:' + observation.id);
  await page.getByLabel('Activité proposée', { exact: true }).fill('Synthetic preschool sorting support');
  await page.getByLabel('Motif contextualisé, sans diagnostic', { exact: true }).fill('Synthetic classroom context, no diagnosis or numeric ranking.');
  await page.getByRole('button', { name: 'Enregistrer la proposition', exact: true }).click();
  const support = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Synthetic preschool sorting support', exact: true }) });
  await expect(support).toBeVisible();
  for (const button of ['Consigner l’accord enseignant', 'Consigner la réalisation']) {
    await support.getByLabel('Compte rendu reçu de l’enseignant', { exact: true }).fill('Synthetic review fixture declaration only.');
    await support.getByRole('combobox', { name: 'Enseignant déclarant', exact: true }).selectOption(f.teacherId);
    await support.getByRole('checkbox', { name: 'J’ai reçu cette déclaration de l’enseignant ; je ne la déduis pas des notes.' }).check();
    await support.getByRole('button', { name: button, exact: true }).click();
    await expect(support.getByRole('button', { name: button, exact: true })).toHaveCount(0);
  }
  expect((await db.collection('pedagogyRemediations').where('schoolId', '==', f.schoolId).get()).size).toBe(1);
  for (const collection of ['grades', 'evaluations', 'weeklyAssessments', 'pedagogyAiOperations']) expect((await db.collection(collection).where('schoolId', '==', f.schoolId).get()).empty).toBe(true);
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
  console.log('PRESCHOOL_BROWSER_PASS: real synthetic observation and support writes; no numeric assessment; responsive 360/768/1440; zero AI');
}
