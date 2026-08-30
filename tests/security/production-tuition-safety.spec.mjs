import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { buildTuitionAmountFingerprint } from '../../scripts/tuition-deadline-safety.mjs';

const read = async (path) => fs.readFile(new URL(path, import.meta.url), 'utf8');

test('amount fingerprints detect amount and installment-count changes', () => {
  const baseline = buildTuitionAmountFingerprint({ A: { t1: 40_000, t2: 30_000, t3: 0 }, B: { t1: 50_000, t2: 40_000 } });
  const amountChanged = buildTuitionAmountFingerprint({ A: { t1: 40_001, t2: 30_000, t3: 0 }, B: { t1: 50_000, t2: 40_000 } });
  const artificialT3 = buildTuitionAmountFingerprint({ A: { t1: 40_000, t2: 30_000, t3: 10_000 }, B: { t1: 50_000, t2: 40_000 } });
  assert.notEqual(amountChanged.installmentAmountsSha256, baseline.installmentAmountsSha256);
  assert.notEqual(amountChanged.annualAmountsSha256, baseline.annualAmountsSha256);
  assert.notEqual(artificialT3.installmentCountsSha256, baseline.installmentCountsSha256);
});

test('Production deploy requires a recent backup and never creates one', async () => {
  const workflow = await read('../../.github/workflows/firebase-deploy.yml');
  assert.match(workflow, /Detect latest existing Firestore backup[\s\S]*verify-production-backup-gate\.mjs/);
  assert.ok(workflow.indexOf('verify-production-backup-gate.mjs') < workflow.indexOf('Deploy Firebase Rules and Functions'));
  assert.doesNotMatch(workflow, /gcloud\s+firestore\s+export/);
});

test('controlled workflow gates backfill and isolated smoke before mutation', async () => {
  const workflow = await read('../../.github/workflows/production-tuition-deadlines-release.yml');
  assert.match(workflow, /options:\s*\[dry-run, backfill, isolated-smoke\]/);
  assert.match(workflow, /BACKFILL_TUITION_DEADLINES_2026_2027/);
  assert.match(workflow, /RUN_ISOLATED_TUITION_DEADLINES_PRODUCTION/);
  assert.ok(workflow.indexOf('verify-production-backup-gate.mjs') < workflow.indexOf('backfill-production-tuition-deadlines.mjs --execute'));
  assert.ok(workflow.indexOf('verify-production-backup-gate.mjs') < workflow.indexOf('test-production-tuition-deadlines-isolated.mjs'));
  assert.doesNotMatch(workflow, /gcloud\s+firestore\s+export/);
});

test('Production fixture runner refuses ITALO and proves exact cleanup', async () => {
  const source = await read('../../scripts/test-production-tuition-deadlines-isolated.mjs');
  assert.match(source, /tuition-deadlines-production-\$\{suffix\}/);
  assert.match(source, /FORBIDDEN_REAL_SCHOOL = 'italo-gsb'/);
  assert.match(source, /assert\.notEqual\(testSchoolId, FORBIDDEN_REAL_SCHOOL\)/);
  assert.doesNotMatch(source, /testSchoolId\s*=\s*['"]italo-gsb/);
  assert.match(source, /PRODUCTION COMPLETION RESIDUALS: 0/);
  assert.match(source, /PRODUCTION COMPLETION ORPHANS: 0/);
  assert.match(source, /PRODUCTION COMPLETION COUNTER RESIDUALS: 0/);
  assert.match(source, /cashClosures/);
  assert.match(source, /cashLedgerDays/);
  assert.match(source, /authUsers/);
  assert.match(source, /auditLogs/);
});

test('backfill is dates-only, backup-gated, amount-protected and idempotent', async () => {
  const source = await read('../../scripts/backfill-production-tuition-deadlines.mjs');
  const workflow = await read('../../.github/workflows/production-tuition-deadlines-release.yml');
  assert.match(source, /Backfill refuses to execute without a backup gate receipt/);
  assert.match(source, /assert\.equal\(projectId, PRODUCTION_PROJECT_ID/);
  assert.match(source, /assertTuitionAmountFingerprint/);
  assert.match(source, /installmentCountsChanged: 0/);
  assert.match(source, /FieldPath\('tuitionPaymentDeadlines'\)/);
  assert.doesNotMatch(source, /classFees.*update|studentFinance.*update|payments.*update/);
  assert.equal((workflow.match(/backfill-production-tuition-deadlines\.mjs --execute/g) || []).length, 2);
});
