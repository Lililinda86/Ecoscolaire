import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyProductionBackupGate,
  verifyProductionBackupReceipt,
} from '../../scripts/verify-production-backup-gate.mjs';

const now = '2026-08-30T12:00:00.000Z';
const operation = (overrides = {}) => ({
  name: 'projects/ecoscolaire-c5861/databases/(default)/operations/export-1',
  done: true,
  metadata: {
    '@type': 'type.googleapis.com/google.firestore.admin.v1.ExportDocumentsMetadata',
    operationState: 'SUCCESSFUL',
    endTime: '2026-08-30T11:00:00.000Z',
  },
  response: { outputUriPrefix: 'gs://production-backups/2026-08-30' },
  ...overrides,
});

test('accepts only a recent successful Production export', () => {
  const receipt = verifyProductionBackupGate({ operations: [operation()], projectId: 'ecoscolaire-c5861', now });
  assert.equal(receipt.status, 'PASS');
  assert.equal(receipt.monitorErrors, 0);
  assert.equal(receipt.ageMinutes, 60);
  assert.equal(verifyProductionBackupReceipt({ receipt }), receipt);
});

test('fails closed when the Production project ID is missing, empty or unexpected', () => {
  for (const projectId of [
    undefined,
    '',
    'ecoscolaire-staging',
    'ecoscolaire-production-shadow',
  ]) {
    assert.throws(() => verifyProductionBackupGate({ operations: [operation()], projectId, now }),
      /unexpected Production project/);
  }
});

test('fails closed for missing, stale, failed, running, future, and wrong-project backups', () => {
  assert.throws(() => verifyProductionBackupGate({ operations: [], projectId: 'ecoscolaire-c5861', now }));
  assert.throws(() => verifyProductionBackupGate({ operations: [operation({ metadata: {
    '@type': 'ExportDocumentsMetadata', operationState: 'SUCCESSFUL', endTime: '2026-08-28T11:00:00.000Z',
  } })], projectId: 'ecoscolaire-c5861', now }));
  assert.throws(() => verifyProductionBackupGate({ operations: [operation({ error: { message: 'monitor failed' } })], projectId: 'ecoscolaire-c5861', now }));
  assert.throws(() => verifyProductionBackupGate({ operations: [operation({ done: false })], projectId: 'ecoscolaire-c5861', now }));
  assert.throws(() => verifyProductionBackupGate({ operations: [operation({ metadata: {
    '@type': 'ExportDocumentsMetadata', operationState: 'SUCCESSFUL', endTime: '2026-08-30T13:00:00.000Z',
  } })], projectId: 'ecoscolaire-c5861', now }));
  assert.throws(() => verifyProductionBackupGate({ operations: [operation()], projectId: 'ecoscolaire-staging', now }));
});

test('receipt verification rejects absent or monitor-error receipts', () => {
  assert.throws(() => verifyProductionBackupReceipt({ receipt: null }));
  assert.throws(() => verifyProductionBackupReceipt({ receipt: {
    status: 'PASS', projectId: 'ecoscolaire-c5861', monitorErrors: 1,
    backupTimestamp: now, evaluatedAt: now,
  } }));
});
