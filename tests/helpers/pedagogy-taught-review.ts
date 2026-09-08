import { expect, test, type Page } from '@playwright/test';
import type { Firestore } from 'firebase-admin/firestore';
import { createRequire } from 'node:module';
import type { ValidatedPreparationSource } from '../../functions/src/pedagogy/weeklyAssessmentGenerator';
const require = createRequire(import.meta.url);
const { reviewChecksum, reviewedTeachingContent } = require('../../functions/lib/pedagogy/teachingEvidence');
const { sourceChecksum } = require('../../functions/lib/pedagogy/weeklyAssessmentGenerator');
const { bindTaughtSnapshot } = require('../../functions/lib/pedagogy/taughtContentCoverage');

/** Stored synthetic rows exercise the deployed review Functions. NEVER generate
 * content or call an AI provider. All IDs belong to the existing disposable fixture.
 */
export async function verifyStoredTaughtReview(page: Page, db: Firestore, f: { schoolId: string; assessmentId: string; teacherId: string }) {
  if (!/^pedagogy-results-[a-f0-9]{16}$/.test(f.schoolId)) throw new Error('Synthetic scope required');
  const prepRef = db.doc('lessonPreparations/' + f.schoolId + '-prep-math');
  const original = (await prepRef.get()).data()!;
  const reviewData = { ...original.reviewData, lessonSteps: '1/2 = 2/4; 2/3 = 4/6. Doubling numerator and denominator only. No multiplication of two fractions.' };
  await prepRef.update({ reviewData, 'teachingConfirmation.reviewChecksum': reviewChecksum({ ...original, reviewData }) });
  const preparations = await db.collection('lessonPreparations').where('schoolId', '==', f.schoolId).get();
  const sources: ValidatedPreparationSource[] = preparations.docs.map(document => {
    const p = document.data();
    return { id: document.id, version: p.version, subjectId: p.subjectId, classSubjectId: p.classSubjectId || p.subjectId, subjectName: p.subjectName || p.subjectId, curriculumUnitId: p.curriculumUnitId || null, lessonTitle: p.reviewData.lessonTitle, objective: p.reviewData.objective, pedagogicalContent: reviewedTeachingContent(p), teachingConfirmationId: p.teachingConfirmation.id, teachingStatus: p.teachingConfirmation.status, effectiveTeachingDate: p.teachingConfirmation.effectiveDate };
  });
  const items = await db.collection('assessmentItems').where('schoolId', '==', f.schoolId).get();
  for (const document of items.docs) {
    const data = document.data();
    const item = { ...data, subjectId: data.subjectId as string, classSubjectId: data.subjectId as string, sourceLessonPreparationIds: data.sourceLessonPreparationIds as string[], sourceCurriculumUnitIds: [] };
    await document.ref.update({ ...bindTaughtSnapshot(item, sources), classSubjectId: data.subjectId, sourceCurriculumUnitIds: [], questionType: 'exercise', ...(document.id.endsWith('-math') ? { questionText: 'Double numerator and denominator of 1/2.', expectedAnswer: '1/2 × 2/2 = 2/4', correctionGuide: '1/2 × 2/2 = 2/4' } : {}) });
  }
  const assessmentRef = db.doc('weeklyAssessments/' + f.assessmentId);
  await assessmentRef.update({ generatorProvider: 'openai', syntheticStoredRowOnly: true, status: 'needs_review', teacherValidated: false, teacherValidations: [], sourceSnapshot: sources, sourceChecksum: sourceChecksum(sources) });
  await page.goto('/#/pedagogy/assessments');
  await expect(page.getByRole('heading', { name: 'Évaluations du vendredi' })).toBeVisible();
  await page.getByText('Sources enseignées — périmètre de revue', { exact: true }).click();
  const scope = page.locator('details').filter({ has: page.getByText('Sources enseignées — périmètre de revue', { exact: true }) });
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await scope.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await test.info().attach('stored-taught-review-' + width, { body: await scope.screenshot(), contentType: 'image/png' });
  }
  await page.getByRole('combobox', { name: /^Enseignant/ }).selectOption(f.teacherId);
  await page.getByRole('textbox', { name: /^Note/ }).fill('Entirely synthetic received fidelity decision, not a real teacher approval.');
  const visa = page.getByRole('button', { name: 'Enregistrer validation enseignant' });
  const receipt = page.getByRole('checkbox', { name: /^Accord enseignant reçu/ });
  await expect(visa).toBeDisabled();
  await receipt.check(); await visa.click();
  await expect(page.getByText(/Corriger les défauts détectés.*OUTSIDE_TAUGHT_CONTENT/)).toBeVisible();
  expect((await assessmentRef.get()).data()?.status).toBe('needs_review');
  await page.getByLabel('Réponse attendue', { exact: true }).first().fill('2/4');
  await page.getByLabel('Consignes de correction', { exact: true }).first().fill('Numerator 1 × 2 = 2; denominator 2 × 2 = 4; resulting fraction 2/4.');
  await page.getByRole('button', { name: 'Enregistrer les corrections', exact: true }).click();
  await expect(page.getByText('Corrections enregistrées à la demande de l’enseignant.', { exact: true })).toBeVisible();
  await expect(receipt).not.toBeChecked();
  // Same version number, changed teaching declaration: checksum must still block.
  await prepRef.update({ 'teachingConfirmation.id': 'synthetic-changed-confirmation' });
  await receipt.check(); await visa.click();
  await expect(page.getByText(/Les enseignements ont changé/)).toBeVisible();
  await prepRef.update({ 'teachingConfirmation.id': original.teachingConfirmation.id });
  await visa.click();
  await expect(page.getByRole('button', { name: 'Passer prête à imprimer' })).toBeVisible();
  await page.getByRole('button', { name: 'Passer prête à imprimer' }).click();
  await expect(page.getByText('Évaluation prête à imprimer.', { exact: true })).toBeVisible();
  const saved = (await assessmentRef.get()).data()!;
  expect(saved.taughtContentReview.received).toBe(true);
  expect(saved.teacherValidations.every((row: { taughtContentReviewPolicy?: string }) => row.taughtContentReviewPolicy === 'taught-snapshot-review-v1')).toBe(true);
  expect((await db.collection('pedagogyAiOperations').where('schoolId', '==', f.schoolId).limit(1).get()).empty).toBe(true);
  console.log('STORED_TAUGHT_REVIEW_PASS: deployed review gate rejects fraction drift and stale confirmation, manual repair and synthetic receipt succeed; ZERO AI CALLS');
}
