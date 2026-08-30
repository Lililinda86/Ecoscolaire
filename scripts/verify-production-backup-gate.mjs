import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const PRODUCTION_PROJECT_ID = 'ecoscolaire-c5861';
const SUCCESS_STATES = new Set(['READY', 'SUCCESS', 'SUCCESSFUL', 'SUCCEEDED']);

const parseTimestamp = (value, label) => {
  const timestamp = Date.parse(String(value || ''));
  assert.ok(Number.isFinite(timestamp), `${label} is missing or invalid.`);
  return timestamp;
};

const operationState = (operation) => String(
  operation?.metadata?.operationState
    || operation?.metadata?.state
    || operation?.response?.state
    || operation?.status
    || '',
).toUpperCase();

const operationTimestamp = (operation) => operation?.metadata?.endTime
  || operation?.response?.endTime
  || operation?.updateTime
  || operation?.metadata?.startTime;

const isExportOperation = (operation) => {
  const type = String(operation?.metadata?.['@type'] || operation?.response?.['@type'] || '');
  const outputUri = operation?.response?.outputUriPrefix || operation?.metadata?.outputUriPrefix;
  return /ExportDocuments/i.test(type) || Boolean(outputUri);
};

export const verifyProductionBackupGate = ({
  operations,
  projectId,
  now = new Date(),
  maxAgeHours = 24,
}) => {
  assert.equal(projectId, PRODUCTION_PROJECT_ID, 'Backup gate refuses an unexpected Production project.');
  assert.ok(Array.isArray(operations), 'Backup monitor output must be a JSON array.');
  assert.ok(Number.isFinite(maxAgeHours) && maxAgeHours > 0, 'Maximum backup age must be positive.');

  const evaluatedAt = parseTimestamp(now instanceof Date ? now.toISOString() : now, 'Gate evaluation timestamp');
  const projectPrefix = `projects/${PRODUCTION_PROJECT_ID}/databases/`;
  const candidates = operations
    .filter(isExportOperation)
    .filter((operation) => String(operation?.name || '').startsWith(projectPrefix))
    .map((operation) => ({ operation, timestamp: parseTimestamp(operationTimestamp(operation), 'Backup timestamp') }))
    .filter(({ timestamp }) => timestamp <= evaluatedAt)
    .sort((left, right) => right.timestamp - left.timestamp);

  assert.ok(candidates.length > 0, 'BACKUP_GATE_FAILED: no completed Production Firestore export was found.');
  const { operation, timestamp } = candidates[0];
  assert.equal(operation.done, true, 'BACKUP_GATE_FAILED: latest Production export is not complete.');
  assert.equal(operation.error, undefined, 'BACKUP_GATE_FAILED: latest Production export has a monitor error.');
  const state = operationState(operation);
  assert.ok(SUCCESS_STATES.has(state), `BACKUP_GATE_FAILED: latest Production export state is ${state || 'UNKNOWN'}.`);

  const ageMs = evaluatedAt - timestamp;
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  assert.ok(ageMs >= 0, 'BACKUP_GATE_FAILED: backup timestamp is after gate evaluation.');
  assert.ok(ageMs <= maxAgeMs, `BACKUP_GATE_FAILED: latest Production export is older than ${maxAgeHours}h.`);

  return {
    status: 'PASS',
    projectId: PRODUCTION_PROJECT_ID,
    operationName: operation.name,
    operationState: state,
    backupTimestamp: new Date(timestamp).toISOString(),
    evaluatedAt: new Date(evaluatedAt).toISOString(),
    maxAgeHours,
    ageMinutes: Math.floor(ageMs / 60_000),
    monitorErrors: 0,
  };
};

export const verifyProductionBackupReceipt = ({ receipt, projectId = PRODUCTION_PROJECT_ID }) => {
  assert.equal(projectId, PRODUCTION_PROJECT_ID, 'Backup receipt project is not Production.');
  assert.equal(receipt?.status, 'PASS', 'A passing backup gate receipt is required.');
  assert.equal(receipt?.projectId, PRODUCTION_PROJECT_ID, 'Backup receipt targets another project.');
  assert.equal(receipt?.monitorErrors, 0, 'Backup receipt contains monitor errors.');
  const backupTimestamp = parseTimestamp(receipt?.backupTimestamp, 'Backup receipt timestamp');
  const evaluatedAt = parseTimestamp(receipt?.evaluatedAt, 'Backup receipt evaluation timestamp');
  assert.ok(backupTimestamp <= evaluatedAt, 'Backup receipt predates its own validation incorrectly.');
  return receipt;
};

const main = () => {
  const operationsPath = process.env.PRODUCTION_BACKUP_OPERATIONS_PATH;
  const receiptPath = process.env.PRODUCTION_BACKUP_RECEIPT_PATH;
  const projectId = process.env.PRODUCTION_FIREBASE_PROJECT_ID;
  const maxAgeHours = Number(process.env.PRODUCTION_BACKUP_MAX_AGE_HOURS || '24');
  assert.ok(operationsPath, 'PRODUCTION_BACKUP_OPERATIONS_PATH is required.');
  assert.ok(receiptPath, 'PRODUCTION_BACKUP_RECEIPT_PATH is required.');
  const operations = JSON.parse(fs.readFileSync(operationsPath, 'utf8'));
  const receipt = verifyProductionBackupGate({ operations, projectId, maxAgeHours });
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
};

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();
