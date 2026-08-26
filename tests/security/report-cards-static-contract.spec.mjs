import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(new URL('../../src/pages/ReportCards.tsx', import.meta.url), 'utf8');
const service = fs.readFileSync(new URL('../../src/services/reportCardFunctions.ts', import.meta.url), 'utf8');
const backend = fs.readFileSync(new URL('../../functions/src/academic/manageReportCard.ts', import.meta.url), 'utf8');
const pdf = fs.readFileSync(new URL('../../src/services/reportCardPdf.ts', import.meta.url), 'utf8');

test('Report Cards UI has explicit selectors and responsive breakpoints covering 360/768/1440', () => {
  for (const selector of ['report-card-year', 'report-card-period', 'report-card-class', 'report-card-student']) {
    assert.match(page, new RegExp(`data-testid=["']${selector}["']`));
  }
  assert.match(page, /@media \(max-width: 900px\)/);
  assert.match(page, /@media \(max-width: 600px\)/);
  assert.match(page, /grid-template-columns:1fr/);
  assert.match(page, /max-width:210mm/);
  assert.match(page, /@page \{ size:A4 portrait; margin:14mm; \}/);
});

test('frontend mutations go only through the callable backend', () => {
  assert.match(service, /httpsCallable<ManageReportCardInput/);
  assert.doesNotMatch(service, /\b(setDoc|addDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\b/);
  assert.doesNotMatch(page, /from ['"]firebase\/firestore['"]/);
});

test('backend exposes only the four canonical lifecycle actions and audit events', () => {
  for (const action of ['GENERATE_DRAFT', 'REFRESH_DRAFT', 'VALIDATE', 'PUBLISH']) assert.match(backend, new RegExp(`'${action}'`));
  assert.doesNotMatch(backend, /DELETE_REPORT_CARD|delete\(reportRef\)|transaction\.delete\(reportRef\)/);
  for (const event of ['REPORT_CARD_DRAFT_GENERATED', 'REPORT_CARD_DRAFT_REFRESHED', 'REPORT_CARD_VALIDATED', 'REPORT_CARD_PUBLISHED']) {
    assert.match(backend, new RegExp(`'${event}'`));
  }
  assert.match(backend, /eligibleEvaluationStatus: 'published'/);
  assert.match(backend, /ranking: 'DEFERRED'/);
  assert.match(backend, /mention: 'DEFERRED'/);
  assert.match(backend, /promotionDecision: 'OUT_OF_SCOPE'/);
});

test('PDF can only use the immutable published snapshot', () => {
  assert.match(pdf, /reportCard\.status !== 'published' \|\| !reportCard\.officialSnapshot/);
  assert.match(pdf, /return reportCard\.officialSnapshot/);
  assert.match(pdf, /setFileId/);
  assert.match(pdf, /format: 'a4'/);
});
