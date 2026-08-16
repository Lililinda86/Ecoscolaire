import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';

type Data = Record<string, unknown>;
type Auth = { uid: string } | undefined;

export type ExpenseStatus = 'DRAFT' | 'POSTED' | 'REVERSED';

export interface ExpenseLedgerTransaction {
  getUser(uid: string): Promise<{ exists: boolean; data?: Data }>;
  getExpense(expenseId: string): Promise<{ exists: boolean; data?: Data }>;
  createExpense(expenseId: string, data: Data): void;
  createAudit(auditId: string, data: Data): void;
}

export interface ExpenseLedgerDependencies {
  runTransaction<T>(handler: (transaction: ExpenseLedgerTransaction) => Promise<T>): Promise<T>;
  newId(collection: 'expenses' | 'audit_logs'): string;
  serverTimestamp(): unknown;
  nowIso(): string;
  today(): string;
}

const httpsError = (code: functions.https.FunctionsErrorCode, message: string): never => {
  throw new functions.https.HttpsError(code, message);
};

const isActive = (user: Data): boolean =>
  user.active === true || user.isActive === true || user.status === 'active';

const cleanRequiredString = (value: unknown, field: string, maxLength = 500): string => {
  if (typeof value !== 'string' || !value.trim()) {
    return httpsError('invalid-argument', `${field} is required.`);
  }
  const clean = value.trim();
  if (clean.length > maxLength) {
    return httpsError('invalid-argument', `${field} exceeds maximum length.`);
  }
  return clean;
};

const validDate = (value: unknown): string => {
  const date = cleanRequiredString(value, 'date', 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return httpsError('invalid-argument', 'date must use YYYY-MM-DD.');
  const [year, month, day] = match.slice(1).map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return httpsError('invalid-argument', 'date does not exist.');
  }
  return date;
};

const rejectTrustedFields = (raw: Data, allowed: string[]): void => {
  const ignoredTrustedFields = [
    'id', 'schoolId', 'actorUid', 'actorRole', 'role', 'createdBy', 'createdByRole',
    'createdAt', 'status', 'kind', 'immutableVersion', 'reversedBy', 'reversedAt',
  ];
  const forbidden = Object.keys(raw).filter(key =>
    !allowed.includes(key) && !ignoredTrustedFields.includes(key));
  if (forbidden.length > 0) {
    httpsError('invalid-argument', `Unsupported or trusted fields: ${forbidden.sort().join(', ')}.`);
  }
};

const loadActor = async (
  uid: string,
  transaction: ExpenseLedgerTransaction,
  allowedRoles: string[],
): Promise<{ role: string; schoolId: string; email: string; testFixture?: true; testRunId?: string }> => {
  const snapshot = await transaction.getUser(uid);
  const user = snapshot.data || {};
  if (!snapshot.exists || !isActive(user)) {
    return httpsError('permission-denied', 'An active user profile is required.');
  }
  const role = typeof user.role === 'string' ? user.role : '';
  if (!allowedRoles.includes(role)) {
    return httpsError('permission-denied', 'User role is not authorized for this expense operation.');
  }
  const schoolId = typeof user.schoolId === 'string' ? user.schoolId.trim() : '';
  if (!schoolId) {
    return httpsError('permission-denied', 'A canonical school assignment is required.');
  }
  const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
  const fixture = user.testFixture === true && typeof user.testRunId === 'string' && user.testRunId.trim()
    ? { testFixture: true as const, testRunId: user.testRunId.trim() }
    : {};
  return { role, schoolId, email, ...fixture };
};

const auditRecord = (
  action: 'EXPENSE_CREATED' | 'EXPENSE_REVERSED',
  actor: { uid: string; role: string; schoolId: string; email: string; testFixture?: true; testRunId?: string },
  expenseId: string,
  timestamp: unknown,
  nowIso: string,
  details: Data,
): Data => ({
  action,
  actorUid: actor.uid,
  actorRole: actor.role,
  schoolId: actor.schoolId,
  userId: actor.uid,
  userRole: actor.role,
  userEmail: actor.email,
  targetType: 'EXPENSE',
  targetId: expenseId,
  targetName: expenseId,
  details,
  createdAt: timestamp,
  timestamp: nowIso,
  canonicalBackendAudit: true,
  ...(actor.testFixture ? { testFixture: true, testRunId: actor.testRunId } : {}),
});

export const calculateNetExpenseTotal = (rows: Data[]): number => rows.reduce((sum, row) => {
  const status = typeof row.status === 'string' ? row.status.toUpperCase() : 'POSTED';
  if (status === 'DRAFT' || ['CANCELLED', 'CANCELED', 'REJECTED'].includes(status)) return sum;
  const amount = row.amount;
  return typeof amount === 'number' && Number.isSafeInteger(amount) ? sum + amount : sum;
}, 0);

export const handleCreateExpense = async (
  raw: unknown,
  auth: Auth,
  dependencies: ExpenseLedgerDependencies,
) => {
  if (!auth?.uid) return httpsError('unauthenticated', 'Authentication required.');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return httpsError('invalid-argument', 'Expense payload is required.');
  }
  const data = raw as Data;
  rejectTrustedFields(data, ['amount', 'date', 'person', 'reason', 'category']);
  const amount = data.amount;
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0) {
    return httpsError('invalid-argument', 'amount must be a positive integer in FCFA.');
  }
  const date = validDate(data.date);
  const person = cleanRequiredString(data.person, 'person', 200);
  const reason = cleanRequiredString(data.reason, 'reason', 500);
  const category = cleanRequiredString(data.category, 'category', 100).toUpperCase();
  const expenseId = dependencies.newId('expenses');
  const auditId = dependencies.newId('audit_logs');

  return dependencies.runTransaction(async transaction => {
    const profile = await loadActor(auth.uid, transaction, ['owner', 'secretary', 'accountant', 'superAdmin']);
    const actor = { uid: auth.uid, ...profile };
    const timestamp = dependencies.serverTimestamp();
    const expense: Data = {
      id: expenseId,
      schoolId: actor.schoolId,
      amount,
      date,
      person,
      reason,
      category,
      kind: 'EXPENSE',
      status: 'POSTED' satisfies ExpenseStatus,
      createdBy: actor.uid,
      createdByRole: actor.role,
      createdAt: timestamp,
      immutableVersion: 1,
      ...(actor.testFixture ? { testFixture: true, testRunId: actor.testRunId } : {}),
    };
    transaction.createExpense(expenseId, expense);
    transaction.createAudit(auditId, auditRecord(
      'EXPENSE_CREATED', actor, expenseId, timestamp, dependencies.nowIso(),
      { amount, date, category, reason },
    ));
    return { success: true, expenseId, schoolId: actor.schoolId, status: 'POSTED' as const };
  });
};

export const handleReverseExpense = async (
  raw: unknown,
  auth: Auth,
  dependencies: ExpenseLedgerDependencies,
) => {
  if (!auth?.uid) return httpsError('unauthenticated', 'Authentication required.');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return httpsError('invalid-argument', 'Reversal payload is required.');
  }
  const data = raw as Data;
  rejectTrustedFields(data, ['expenseId', 'reason']);
  const originalExpenseId = cleanRequiredString(data.expenseId, 'expenseId', 512);
  const reversalReason = cleanRequiredString(data.reason, 'reason', 500);
  const reversalId = `${originalExpenseId}__reversal`;
  if (reversalId.length > 1_024) return httpsError('invalid-argument', 'expenseId is too long.');
  const auditId = dependencies.newId('audit_logs');

  return dependencies.runTransaction(async transaction => {
    const profile = await loadActor(auth.uid, transaction, ['owner', 'superAdmin']);
    const actor = { uid: auth.uid, ...profile };
    const [originalSnapshot, reversalSnapshot] = await Promise.all([
      transaction.getExpense(originalExpenseId),
      transaction.getExpense(reversalId),
    ]);
    if (!originalSnapshot.exists) return httpsError('not-found', 'Original expense was not found.');
    if (reversalSnapshot.exists) return httpsError('already-exists', 'Expense has already been reversed.');
    const original = originalSnapshot.data || {};
    if (original.schoolId !== actor.schoolId) {
      return httpsError('permission-denied', 'Cross-school expense reversal is forbidden.');
    }
    if (original.kind === 'REVERSAL' || typeof original.originalExpenseId === 'string') {
      return httpsError('failed-precondition', 'A reversal entry cannot be reversed.');
    }
    const originalStatus = typeof original.status === 'string' ? original.status.toUpperCase() : 'POSTED';
    if (originalStatus !== 'POSTED') {
      return httpsError('failed-precondition', 'Only a posted expense can be reversed.');
    }
    const originalAmount = original.amount;
    if (typeof originalAmount !== 'number' || !Number.isSafeInteger(originalAmount) || originalAmount <= 0) {
      return httpsError('failed-precondition', 'Original expense amount is invalid.');
    }
    const timestamp = dependencies.serverTimestamp();
    const reversal: Data = {
      id: reversalId,
      schoolId: actor.schoolId,
      amount: -originalAmount,
      originalAmount,
      originalExpenseId,
      date: dependencies.today(),
      person: typeof original.person === 'string' ? original.person : 'Contre-passation',
      reason: reversalReason,
      originalReason: typeof original.reason === 'string' ? original.reason : '',
      category: typeof original.category === 'string' ? original.category : 'GENERAL',
      kind: 'REVERSAL',
      status: 'REVERSED' satisfies ExpenseStatus,
      createdBy: actor.uid,
      createdByRole: actor.role,
      createdAt: timestamp,
      reversedBy: actor.uid,
      reversedByRole: actor.role,
      reversedAt: timestamp,
      immutableVersion: 1,
      ...(actor.testFixture ? { testFixture: true, testRunId: actor.testRunId } : {}),
    };
    transaction.createExpense(reversalId, reversal);
    transaction.createAudit(auditId, auditRecord(
      'EXPENSE_REVERSED', actor, originalExpenseId, timestamp, dependencies.nowIso(),
      { reversalId, originalExpenseId, originalAmount, reversalAmount: -originalAmount, reason: reversalReason },
    ));
    return {
      success: true,
      expenseId: originalExpenseId,
      reversalId,
      schoolId: actor.schoolId,
      originalAmount,
      reversalAmount: -originalAmount,
      status: 'REVERSED' as const,
    };
  });
};

const productionDependencies: ExpenseLedgerDependencies = {
  runTransaction: handler => {
    const db = admin.firestore();
    return db.runTransaction(async nativeTransaction => handler({
    getUser: async uid => {
      const snapshot = await nativeTransaction.get(db.collection('users').doc(uid));
      return { exists: snapshot.exists, data: snapshot.data() };
    },
    getExpense: async expenseId => {
      const snapshot = await nativeTransaction.get(db.collection('expenses').doc(expenseId));
      return { exists: snapshot.exists, data: snapshot.data() };
    },
    createExpense: (expenseId, data) => nativeTransaction.create(db.collection('expenses').doc(expenseId), data),
    createAudit: (auditId, data) => nativeTransaction.create(db.collection('audit_logs').doc(auditId), data),
    }));
  },
  newId: collectionName => admin.firestore().collection(collectionName).doc().id,
  serverTimestamp: () => FieldValue.serverTimestamp(),
  nowIso: () => new Date().toISOString(),
  today: () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date()),
};

export const createExpense = functions.https.onCall((data, context) =>
  handleCreateExpense(data, context.auth, productionDependencies));

export const reverseExpense = functions.https.onCall((data, context) =>
  handleReverseExpense(data, context.auth, productionDependencies));
