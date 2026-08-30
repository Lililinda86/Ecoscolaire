import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  countFixtureCleanupOrphans,
  exactTuitionReceiptCounterId,
} from '../../scripts/production-cash-day-fixture.mjs';

test('Production receipt counter ownership is exact and never ITALO', () => {
  const testRunId = 'run-123-1';
  const schoolId = `tuition-deadlines-production-${testRunId}`;
  assert.equal(exactTuitionReceiptCounterId({ schoolId, testRunId }), `receipts_${schoolId}`);
  assert.throws(() => exactTuitionReceiptCounterId({ schoolId: 'italo-gsb', testRunId }));
  assert.throws(() => exactTuitionReceiptCounterId({ schoolId: `tuition-deadlines-production-other`, testRunId }));
  assert.equal(countFixtureCleanupOrphans({ cashClosures: 0, cashLedgerDays: 0, counters: 0,
    authUsers: 0, auditLogs: 0 }), 0);
});

test('legacy backfill path refuses direct Production execution', async () => {
  const source = await fs.readFile(new URL('../../scripts/backfill-tuition-deadlines.mjs', import.meta.url), 'utf8');
  assert.match(source, /assert\.notEqual\(PROJECT_ID, 'ecoscolaire-c5861'/);
  assert.match(source, /Direct Production backfill is forbidden/);
});
