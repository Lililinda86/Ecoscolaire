import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const rules = await readFile('firestore.rules', 'utf8');
const backend = await readFile('functions/src/secretaryCollections.ts', 'utf8');
const closure = await readFile('functions/src/index.ts', 'utf8');

const receiptRule = rules.match(/match \/receipts\/\{receiptId\} \{[\s\S]*?\n    \}/)?.[0] ?? '';
const cashLedgerRule = rules.match(/match \/cashLedgerDays\/\{ledgerId\} \{[\s\S]*?\n    \}/)?.[0] ?? '';

test('receipt parent access is constrained by tenant and authorized studentIds', () => {
  assert.match(receiptRule, /isParent\(\)/);
  assert.match(receiptRule, /hasSchoolAccess\(resource\.data\.schoolId\)/);
  assert.match(receiptRule, /resource\.data\.studentId in getUserData\(\)\.get\('studentIds', \[\]\)/);
  assert.match(receiptRule, /isOwner\(\).*isDirector\(\).*isSecretary\(\).*isAccountant\(\)/s);
  assert.match(receiptRule, /allow write: if false/);
});

test('cash day ledger is backend-only in Firestore Rules', () => {
  assert.match(cashLedgerRule, /allow read, write: if false/);
});

test('payment, reversal and closure share one deterministic tenant/day ledger', () => {
  for (const source of [backend, closure]) {
    assert.match(source, /makeCashLedgerDayId/);
    assert.match(source, /CASH_LEDGER_COLLECTION/);
  }
  assert.match(backend, /requireOpenCashDay/);
  assert.match(backend, /cashReceived: safeAdd\(currentCashReceived, amount, 'cashReceived'\)/);
  assert.match(backend, /cashReceived: safeAdd\(currentCashReceived, -originalAmount, 'cashReceived'\)/);
  assert.match(closure, /requireCashLedgerTotalAtClose/);
  assert.match(closure, /status: 'closed'/);
});

test('reversal authorization remains owner or superAdmin only', () => {
  assert.match(backend, /validateActiveUser\(userSnap, new Set\(\['owner', 'superAdmin'\]\)\)/);
});
