const assert = require('node:assert/strict');
const {
  calculateCollectedPaymentTotal,
  calculateNetExpenseTotal,
  handleCreateExpense,
  handleReverseExpense,
} = require('../../functions/lib/expenseLedger.js');

const users = new Map([
  ['owner-a', { role: 'owner', schoolId: 'school-a', email: 'owner@a.test', active: true }],
  ['secretary-a', { role: 'secretary', schoolId: 'school-a', email: 'secretary@a.test', isActive: true }],
  ['board-a', { role: 'boardViewer', schoolId: 'school-a', email: 'board@a.test', active: true }],
  ['owner-b', { role: 'owner', schoolId: 'school-b', email: 'owner@b.test', active: true }],
]);
const expenses = new Map();
const audits = new Map();
let nextExpense = 0;
let nextAudit = 0;
let transactionTail = Promise.resolve();
const serverTimestamp = Object.freeze({ trustedServerTimestamp: true });

const dependencies = {
  newId: collection => collection === 'expenses' ? `expense-${++nextExpense}` : `audit-${++nextAudit}`,
  serverTimestamp: () => serverTimestamp,
  nowIso: () => '2026-08-16T12:00:00.000Z',
  today: () => '2026-08-16',
  runTransaction: handler => {
    const operation = transactionTail.then(() => handler({
      getUser: async uid => ({ exists: users.has(uid), data: users.get(uid) }),
      getExpense: async id => ({ exists: expenses.has(id), data: expenses.get(id) }),
      createExpense: (id, data) => {
        if (expenses.has(id)) {
          const error = new Error('already exists');
          error.code = 'already-exists';
          throw error;
        }
        expenses.set(id, structuredClone(data));
      },
      createAudit: (id, data) => {
        if (audits.has(id)) throw new Error('audit already exists');
        audits.set(id, structuredClone(data));
      },
    }));
    transactionTail = operation.catch(() => undefined);
    return operation;
  },
};

const auth = uid => ({ uid });
const validExpense = { amount: 5000, date: '2026-08-16', person: 'Fournisseur test', reason: 'Craie', category: 'SUPPLIES' };
const expectCode = async (operation, code) => assert.rejects(operation, error => {
  assert.equal(error.code, code);
  return true;
});

(async () => {
  const ownerResult = await handleCreateExpense(validExpense, auth('owner-a'), dependencies);
  const secretaryResult = await handleCreateExpense(validExpense, auth('secretary-a'), dependencies);
  assert.equal(ownerResult.status, 'POSTED');
  assert.equal(secretaryResult.status, 'POSTED');
  assert.equal(expenses.get(ownerResult.expenseId).createdBy, 'owner-a');
  assert.equal(expenses.get(secretaryResult.expenseId).createdByRole, 'secretary');
  assert.equal(expenses.get(ownerResult.expenseId).schoolId, 'school-a');

  await expectCode(() => handleCreateExpense(validExpense, auth('board-a'), dependencies), 'permission-denied');
  const forged = await handleCreateExpense({
    ...validExpense, schoolId: 'school-b', actorUid: 'victim', actorRole: 'superAdmin', role: 'superAdmin', createdBy: 'victim',
  }, auth('secretary-a'), dependencies);
  assert.equal(expenses.get(forged.expenseId).schoolId, 'school-a');
  assert.equal(expenses.get(forged.expenseId).createdBy, 'secretary-a');
  assert.equal(expenses.get(forged.expenseId).createdByRole, 'secretary');

  await expectCode(
    () => handleReverseExpense({ expenseId: secretaryResult.expenseId, reason: 'Erreur' }, auth('secretary-a'), dependencies),
    'permission-denied',
  );
  await expectCode(
    () => handleReverseExpense({ expenseId: secretaryResult.expenseId, reason: 'Board attempt' }, auth('board-a'), dependencies),
    'permission-denied',
  );
  const originalBefore = structuredClone(expenses.get(ownerResult.expenseId));
  const reverseResult = await handleReverseExpense(
    { expenseId: ownerResult.expenseId, reason: 'Facture annulée' }, auth('owner-a'), dependencies,
  );
  assert.deepEqual(expenses.get(ownerResult.expenseId), originalBefore, 'original expense must remain byte-for-byte unchanged');
  const reversal = expenses.get(reverseResult.reversalId);
  assert.equal(reversal.originalExpenseId, ownerResult.expenseId);
  assert.equal(reversal.originalAmount, 5000);
  assert.equal(reversal.amount, -5000);
  assert.equal(reversal.status, 'REVERSED');
  assert.equal(calculateNetExpenseTotal([originalBefore, reversal]), 0);
  assert.ok([...audits.values()].some(row => row.action === 'EXPENSE_CREATED' && row.targetId === ownerResult.expenseId));
  assert.ok([...audits.values()].some(row => row.action === 'EXPENSE_REVERSED' && row.targetId === ownerResult.expenseId));
  for (const row of audits.values()) {
    assert.equal(row.canonicalBackendAudit, true);
    assert.equal(row.createdAt.trustedServerTimestamp, true);
  }
  assert.equal(
    [...audits.values()].find(row => row.action === 'EXPENSE_CREATED' && row.targetId === ownerResult.expenseId).details.reason,
    validExpense.reason,
  );
  await expectCode(
    () => handleReverseExpense({ expenseId: ownerResult.expenseId, reason: 'Second essai' }, auth('owner-a'), dependencies),
    'already-exists',
  );

  const concurrencyExpense = await handleCreateExpense(validExpense, auth('owner-a'), dependencies);
  const concurrent = await Promise.allSettled([
    handleReverseExpense({ expenseId: concurrencyExpense.expenseId, reason: 'Concurrent A' }, auth('owner-a'), dependencies),
    handleReverseExpense({ expenseId: concurrencyExpense.expenseId, reason: 'Concurrent B' }, auth('owner-a'), dependencies),
  ]);
  assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(concurrent.filter(result => result.status === 'rejected').length, 1);

  expenses.set('expense-school-b', {
    id: 'expense-school-b', schoolId: 'school-b', amount: 5000, date: '2026-08-16',
    person: 'Vendor', reason: 'School B', category: 'GENERAL', kind: 'EXPENSE', status: 'POSTED',
  });
  await expectCode(
    () => handleReverseExpense({ expenseId: 'expense-school-b', reason: 'Cross-school' }, auth('owner-a'), dependencies),
    'permission-denied',
  );

  assert.equal(calculateNetExpenseTotal([
    { amount: 5000, status: 'POSTED' },
    { amount: -5000, status: 'REVERSED' },
    { amount: 9000, status: 'DRAFT' },
  ]), 0);
  assert.equal(calculateCollectedPaymentTotal([
    { id: 'payment-a', amount: 5000, method: 'cash', status: 'completed' },
    { amount: -5000, method: 'cash', status: 'completed', kind: 'PAYMENT_REVERSAL', originalPaymentId: 'payment-a' },
    { amount: -9999, method: 'cash', status: 'completed' },
  ], 'cash'), 0);

  console.log('Expense ledger create/reversal/concurrency/audit/dashboard tests: PASS');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
