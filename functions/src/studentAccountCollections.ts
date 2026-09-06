import * as admin from 'firebase-admin';
import { readStudentFees, writePendingFees, PendingFeeAssignment } from './studentFeeAssignments';
import * as crypto from 'crypto';
import * as functions from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';
import { collectionInternals, CollectionQuote, TransportCollectionQuote } from './secretaryCollections';
import { planTransportAllocations } from './transportPaymentPolicy';
import { calculateCollectedPaymentTotal } from './expenseLedger';
import {
  CASH_LEDGER_COLLECTION,
  CashLedgerIntegrityError,
  makeCashLedgerDayId,
  requireOpenCashLedger
} from './cashClosureIntegrity';

type Data = Record<string, unknown>;
type CanonicalType = 'registration_fee' | 'tuition' | 'transport';
type AccountLineType = CanonicalType | 'uniforms' | 'other';

interface RequestedLine {
  type: AccountLineType;
  installment: 'T1' | 'T2' | 'T3' | null;
  period: string | null;
  feeId: string | null;
  amount: number;
}

interface AccountLine extends CollectionQuote {
  key: string;
  type: AccountLineType;
  label: string;
  installment: 'T1' | 'T2' | 'T3' | null;
  period: string | null;
  feeId: string | null;
  selectable: boolean;
}

const activeStatuses = new Set(['approved', 'applied', 'settled']);
const httpsError = (code: functions.https.FunctionsErrorCode, message: string, businessCode: string) =>
  new functions.https.HttpsError(code, message, { businessCode });

const requireRequestId = (value: unknown): string => {
  const requestId = collectionInternals.requireId(value, 'requestId');
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(requestId)) {
    throw httpsError('invalid-argument', 'requestId format is invalid.', 'INVALID_REQUEST_ID');
  }
  return requestId;
};

export const lineKey = (line: Pick<RequestedLine, 'type' | 'installment' | 'period' | 'feeId'>): string => {
  if (line.type === 'tuition') return `tuition:${line.installment}`;
  if (line.type === 'transport') return line.period ? `transport:${line.period}` : 'transport';
  if (line.type === 'other') return `other:${line.feeId}`;
  return line.type;
};

const parseRequestedLines = (value: unknown): RequestedLine[] => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) {
    throw httpsError('invalid-argument', 'allocations must contain between 1 and 20 lines.', 'INVALID_ALLOCATIONS');
  }
  const lines = value.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw httpsError('invalid-argument', `allocations[${index}] is invalid.`, 'INVALID_ALLOCATIONS');
    }
    const source = raw as Data;
    if (!['registration_fee', 'tuition', 'transport', 'uniforms', 'other'].includes(String(source.type))) {
      throw httpsError('invalid-argument', `allocations[${index}].type is invalid.`, 'INVALID_PAYMENT_TYPE');
    }
    const type = source.type as AccountLineType;
    const installment = type === 'tuition' ? String(source.installment || '') : null;
    if (type === 'tuition' && !['T1', 'T2', 'T3'].includes(String(installment))) {
      throw httpsError('invalid-argument', `allocations[${index}].installment is invalid.`, 'INVALID_INSTALLMENT');
    }
    const feeId = type === 'other' ? collectionInternals.requireId(source.feeId, `allocations[${index}].feeId`) : null;
    const period = type === 'transport' && source.period != null ? String(source.period) : null;
    if (period && !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      throw httpsError('invalid-argument', 'Invalid transport month.', 'INVALID_TRANSPORT_PERIOD');
    }
    return {
      type,
      installment: installment as RequestedLine['installment'],
      period,
      feeId,
      amount: collectionInternals.requireMoney(source.amount, `allocations[${index}].amount`)
    };
  });
  const keys = lines.map(lineKey);
  if (lines.some(l => l.type === 'transport' && !l.period) && lines.filter(l => l.type === 'transport').length > 1) {
    throw httpsError('invalid-argument', 'Do not mix aggregate and monthly transport.', 'DUPLICATE_ALLOCATION');
  }
  if (new Set(keys).size !== keys.length) {
    throw httpsError('invalid-argument', 'Each financial obligation can appear only once.', 'DUPLICATE_ALLOCATION');
  }
  return lines;
};

const paymentLineAmount = (payment: Data, targetKey: string): number => {
  const status = typeof payment.status === 'string' ? payment.status.toLowerCase() : 'completed';
  if (['pending', 'failed', 'cancelled', 'canceled', 'refunded', 'reversed'].includes(status)) return 0;
  if (payment.type === 'collection' && Array.isArray(payment.lineItems)) {
    return payment.lineItems.reduce((total: number, raw) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return total;
      const line = raw as Data;
      if (line.key !== targetKey) return total;
      if (typeof line.amount !== 'number' || !Number.isSafeInteger(line.amount) || line.amount === 0) {
        throw httpsError('failed-precondition', 'Historical collection line is invalid.', 'FINANCIAL_HISTORY_INCONSISTENT');
      }
      return collectionInternals.safeAdd(total, line.amount, 'historicalLineAmount');
    }, 0);
  }
  const legacyKey = payment.type === 'tuition' ? `tuition:${payment.installment}` : String(payment.type);
  if (legacyKey !== targetKey) return 0;
  if (typeof payment.amount !== 'number' || !Number.isSafeInteger(payment.amount) || payment.amount === 0) {
    throw httpsError('failed-precondition', 'Historical payment is invalid.', 'FINANCIAL_HISTORY_INCONSISTENT');
  }
  return payment.amount;
};

const simpleQuote = (gross: number, previousPaid: number): CollectionQuote => {
  if (!Number.isSafeInteger(gross) || gross <= 0 || !Number.isSafeInteger(previousPaid)
      || previousPaid < 0 || previousPaid > gross) {
    throw httpsError('failed-precondition', 'Fee history is inconsistent.', 'FINANCIAL_HISTORY_INCONSISTENT');
  }
  const remainingBalance = gross - previousPaid;
  return {
    grossExpectedAmount: gross,
    discountAmount: 0,
    netExpectedAmount: gross,
    previousPaid,
    remainingBalance,
    status: remainingBalance === 0 ? 'PAID' : previousPaid > 0 ? 'PARTIAL' : 'UNPAID',
    benefits: [],
    originalDueDate: null,
    effectiveDueDate: null,
    nextDueDate: null,
    moratoriumStatus: 'NONE',
    moratoriumId: null,
    overdue: false,
    dueStatus: remainingBalance === 0 ? 'PAID' : 'UNCONFIGURED'
  };
};

const configuredOtherFees = (school: Data, student: Data, classData: Data): Array<{ id: string; label: string; amount: number }> => {
  const catalog = school.feeCatalog;
  const entries: Data[] = Array.isArray(catalog)
    ? catalog.filter(item => !!item && typeof item === 'object' && !Array.isArray(item)) as Data[]
    : catalog && typeof catalog === 'object'
      ? Object.entries(catalog as Data).map(([id, value]) => ({ id, ...(value as Data) }))
      : [];
  return entries.flatMap(entry => {
    if (entry.schemaVersion === 2) return [];
    if (entry.active === false || typeof entry.id !== 'string' || !entry.id.trim()
        || typeof entry.label !== 'string' || !entry.label.trim()
        || typeof entry.amount !== 'number' || !Number.isSafeInteger(entry.amount) || entry.amount <= 0) return [];
    if (Array.isArray(entry.classIds) && !entry.classIds.includes(student.classId)) return [];
    if (Array.isArray(entry.cycles) && !entry.cycles.includes(classData.cycle) && !entry.cycles.includes(classData.level)) return [];
    return [{ id: entry.id, label: entry.label.trim(), amount: entry.amount }];
  });
};

const accountTotals = (lines: AccountLine[]) => lines.reduce((totals, line) => ({
  totalBilled: collectionInternals.safeAdd(totals.totalBilled, line.grossExpectedAmount, 'totalBilled'),
  totalBenefits: collectionInternals.safeAdd(totals.totalBenefits, line.discountAmount, 'totalBenefits'),
  totalPaid: collectionInternals.safeAdd(totals.totalPaid, line.previousPaid, 'totalPaid'),
  totalRemaining: collectionInternals.safeAdd(totals.totalRemaining, line.remainingBalance, 'totalRemaining'),
  overdueAmount: collectionInternals.safeAdd(totals.overdueAmount, line.overdue ? line.remainingBalance : 0, 'overdueAmount')
}), { totalBilled: 0, totalBenefits: 0, totalPaid: 0, totalRemaining: 0, overdueAmount: 0 });

export const buildAccountLines = async (
  transaction: admin.firestore.Transaction,
  db: admin.firestore.Firestore,
  uid: string,
  schoolId: string,
  studentId: string,
  academicYear: string
): Promise<{ lines: AccountLine[]; base: Awaited<ReturnType<typeof collectionInternals.readQuoteContext>>; pendingFees: PendingFeeAssignment[] }> => {
  const baseInput = collectionInternals.parseQuoteInput({ schoolId, studentId, academicYear, type: 'registration_fee' });
  const base = await collectionInternals.readQuoteContext(transaction, db, uid, baseInput);
  const lines: AccountLine[] = [{
    ...base.quote, key: 'registration_fee', type: 'registration_fee', label: "Frais d'inscription",
    installment: null, period: null, feeId: null, selectable: base.quote.remainingBalance > 0
  }];
  for (const installment of ['T1', 'T2', 'T3'] as const) {
    try {
      const input = collectionInternals.parseQuoteInput({ schoolId, studentId, academicYear, type: 'tuition', installment });
      const context = await collectionInternals.readQuoteContext(transaction, db, uid, input);
      lines.push({ ...context.quote, key: `tuition:${installment}`, type: 'tuition',
        label: `Scolarité ${installment}`, installment, period: null, feeId: null,
        selectable: context.quote.remainingBalance > 0 });
    } catch (error) {
      const businessCode = (error as { details?: { businessCode?: string } }).details?.businessCode;
      if (businessCode !== 'GROSS_AMOUNT_NOT_CONFIGURED') throw error;
    }
  }
  try {
    const input = collectionInternals.parseQuoteInput({ schoolId, studentId, academicYear, type: 'transport' });
    const context = await collectionInternals.readQuoteContext(transaction, db, uid, input);
    const quote = context.quote as TransportCollectionQuote;
    if (quote.transportState === 'BILLABLE') lines.push({ ...quote, key: 'transport', type: 'transport',
      label: 'Transport', installment: null, period: null, feeId: null,
      selectable: quote.remainingBalance > 0 });
  } catch (error) {
    const businessCode = (error as { details?: { businessCode?: string } }).details?.businessCode;
    if (!['TRANSPORT_NOT_SUBSCRIBED', 'TRANSPORT_FREE_SECONDARY', 'TRANSPORT_FEE_POLICY_NOT_CONFIGURED'].includes(String(businessCode))) throw error;
  }
  const payments = base.payments.filter(payment => payment.schoolId === schoolId && payment.academicYear === academicYear);
  const globalFees = base.school.globalFees && typeof base.school.globalFees === 'object' ? base.school.globalFees as Data : {};
  const uniformGross = base.finance.feeUniforms ?? globalFees.feeUniforms;
  if (typeof uniformGross === 'number' && Number.isSafeInteger(uniformGross) && uniformGross > 0) {
    const quote = simpleQuote(uniformGross, payments.reduce((sum, payment) =>
      collectionInternals.safeAdd(sum, paymentLineAmount(payment, 'uniforms'), 'uniformPaid'), 0));
    lines.push({ ...quote, key: 'uniforms', type: 'uniforms', label: 'Tenue scolaire', installment: null,
      period: null, feeId: null, selectable: quote.remainingBalance > 0 });
  }
  for (const fee of configuredOtherFees(base.school, base.student, base.classData)) {
    const key = `other:${fee.id}`;
    const quote = simpleQuote(fee.amount, payments.reduce((sum, payment) =>
      collectionInternals.safeAdd(sum, paymentLineAmount(payment, key), 'otherFeePaid'), 0));
    lines.push({ ...quote, key, type: 'other', label: fee.label, installment: null,
      period: null, feeId: fee.id, selectable: quote.remainingBalance > 0 });
  }
  const assigned = await readStudentFees(transaction, db, schoolId, studentId, academicYear, base.school, base.student, base.classData);
  for (const fee of assigned.fees) {
    const key = `other:${fee.id}`;
    const paid = payments.reduce((sum, payment) => collectionInternals.safeAdd(sum, paymentLineAmount(payment, key), 'catalogFeePaid'), 0);
    const quote = simpleQuote(fee.amount, paid);
    const today = collectionInternals.getDoualaDate();
    const dueDate = fee.dueDate;
    const overdue = !!dueDate && dueDate < today && quote.remainingBalance > 0;
    lines.push({ ...quote, key, type: 'other', label: fee.label, installment: null, period: null, feeId: fee.id,
      originalDueDate: dueDate, effectiveDueDate: dueDate, nextDueDate: quote.remainingBalance > 0 ? dueDate : null,
      overdue, dueStatus: quote.remainingBalance === 0 ? 'PAID' : !dueDate ? 'UNCONFIGURED' : overdue ? 'OVERDUE' : dueDate > today ? 'NOT_DUE' : 'DUE_TODAY',
      selectable: quote.remainingBalance > 0 });
  }
  return { lines, base, pendingFees: assigned.pending };
};

export const monthlyLines = (lines: AccountLine[]): AccountLine[] => lines.flatMap(line => {
  if (line.type !== 'transport') return [line];
  const quote = line as AccountLine & TransportCollectionQuote;
  return quote.installments.map(item => ({ ...line, ...item, key: `transport:${item.period}`, period: item.period,
    label: `Transport — ${item.period}${item.zonePk == null ? '' : ` — PK${item.zonePk}`}`, selectable: item.remainingBalance > 0 }));
});

export const getStudentFinancialAccount = functions.https.onCall(async (raw, context) => {
  if (!context.auth?.uid) throw httpsError('unauthenticated', 'Authentication required.', 'UNAUTHENTICATED');
  const source = (raw || {}) as Data;
  const schoolId = collectionInternals.requireId(source.schoolId, 'schoolId');
  const studentId = collectionInternals.requireId(source.studentId, 'studentId');
  const academicYear = collectionInternals.requireAcademicYear(source.academicYear);
  const db = admin.firestore();
  return db.runTransaction(async transaction => {
    const { lines, base, pendingFees } = await buildAccountLines(transaction, db, context.auth!.uid, schoolId, studentId, academicYear);
    writePendingFees(transaction, pendingFees);
    return {
      student: { id: studentId, name: base.student.name || '', matricule: base.student.matricule || '',
        classId: base.student.classId || '', className: base.classData.name || '' },
      school: { id: schoolId, name: base.school.name || 'EcoScolaire' },
      academicYear,
      totals: accountTotals(lines),
      lines: source.monthlyTransport === true ? monthlyLines(lines) : lines
    };
  });
});

export const recordCashCollection = functions.https.onCall(async (raw, context) => {
  if (!context.auth?.uid) throw httpsError('unauthenticated', 'Authentication required.', 'UNAUTHENTICATED');
  const source = (raw || {}) as Data;
  const schoolId = collectionInternals.requireId(source.schoolId, 'schoolId');
  const studentId = collectionInternals.requireId(source.studentId, 'studentId');
  const academicYear = collectionInternals.requireAcademicYear(source.academicYear);
  const requestId = requireRequestId(source.requestId);
  const requested = parseRequestedLines(source.allocations);
  const description = source.description ? collectionInternals.requireText(source.description, 'description', 1, 500) : null;
  const uid = context.auth.uid;
  const collectionId = collectionInternals.hashId('collection', [schoolId, requestId]);
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ schoolId, studentId, academicYear,
    allocations: requested, description }), 'utf8').digest('hex');
  const db = admin.firestore();

  return db.runTransaction(async transaction => {
    const paymentRef = db.collection('payments').doc(collectionId);
    const receiptRef = db.collection('receipts').doc(collectionId);
    // Replays disclose financial data too: authorize before returning a stored receipt.
    const user = (await transaction.get(db.collection('users').doc(uid))).data() || {};
    if ((user.active !== true && user.isActive !== true) || user.status === 'inactive'
        || !['owner', 'director', 'accountant', 'secretary', 'superAdmin'].includes(String(user.role))
        || (user.role !== 'superAdmin' && user.schoolId !== schoolId)) {
      throw httpsError('permission-denied', 'Access denied.', 'PERMISSION_DENIED');
    }
    const [paymentSnap, receiptSnap] = await Promise.all([transaction.get(paymentRef), transaction.get(receiptRef)]);
    if (paymentSnap.exists || receiptSnap.exists) {
      if (!paymentSnap.exists || !receiptSnap.exists || paymentSnap.data()?.requestFingerprint !== fingerprint
          || receiptSnap.data()?.requestFingerprint !== fingerprint) {
        throw httpsError('already-exists', 'requestId already identifies another collection.', 'IDEMPOTENCY_CONFLICT');
      }
      const receipt = receiptSnap.data() || {};
      return { collectionId, paymentId: collectionId, receiptId: collectionId,
        receiptNumber: receipt.receiptNumber, amount: receipt.amount, lineItems: receipt.lineItems || [],
        remainingBalance: receipt.remainingBalance, idempotentReplay: true };
    }

    const { lines: accountLines, base, pendingFees } = await buildAccountLines(transaction, db, uid, schoolId, studentId, academicYear);
    const accountByKey = new Map([...accountLines, ...monthlyLines(accountLines)].map(line => [line.key, line]));
    const lineItems = requested.map((item, sequence) => {
      const quote = accountByKey.get(lineKey(item));
      if (!quote) throw httpsError('failed-precondition', 'The selected fee is not applicable.', 'FEE_NOT_APPLICABLE');
      if (quote.remainingBalance <= 0) throw httpsError('failed-precondition', 'A selected fee is already paid.', 'NO_REMAINING_BALANCE');
      if (item.amount > quote.remainingBalance && (item.type !== 'transport' || item.period)) {
        throw httpsError('failed-precondition', 'A line exceeds its remaining balance.', 'OVERPAYMENT_DENIED');
      }
      const allocatedAmount = item.type === 'transport' ? Math.min(item.amount, quote.remainingBalance) : item.amount;
      const transportCredit = item.type === 'transport' ? item.amount - allocatedAmount : 0;
      return { key: quote.key, type: item.type, installment: item.installment, period: item.period,
        feeId: item.feeId, label: quote.label, amount: item.amount, allocatedAmount, transportCredit, sequence,
        grossExpectedAmount: quote.grossExpectedAmount, discountAmount: quote.discountAmount,
        netExpectedAmount: quote.netExpectedAmount, previousPaid: quote.previousPaid,
        newPaid: collectionInternals.safeAdd(quote.previousPaid, item.amount, 'newPaid'),
        remainingBalance: Math.max(0, quote.remainingBalance - allocatedAmount), status: quote.status,
        benefits: quote.benefits, originalDueDate: quote.originalDueDate,
        effectiveDueDate: quote.effectiveDueDate, moratoriumStatus: quote.moratoriumStatus,
        overdue: quote.overdue, dueStatus: quote.dueStatus };
    });
    const total = lineItems.reduce((sum, line) => collectionInternals.safeAdd(sum, line.amount, 'collectionTotal'), 0);
    const date = collectionInternals.getDoualaDate();
    const cashLedgerId = makeCashLedgerDayId(schoolId, date);
    const cashLedgerRef = db.collection(CASH_LEDGER_COLLECTION).doc(cashLedgerId);
    const cashClosureRef = db.collection('cashClosures').doc(cashLedgerId);
    const [cashLedgerSnap, cashClosureSnap] = await Promise.all([transaction.get(cashLedgerRef), transaction.get(cashClosureRef)]);
    let currentCashReceived: number;
    try {
      currentCashReceived = requireOpenCashLedger(cashLedgerSnap.exists ? cashLedgerSnap.data() || {} : null,
        cashClosureSnap.exists, schoolId, date);
    } catch (error) {
      if (error instanceof CashLedgerIntegrityError) {
        throw httpsError('failed-precondition', error.message, error.businessCode);
      }
      throw error;
    }
    if (!cashLedgerSnap.exists) {
      const legacy = await transaction.get(db.collection('payments').where('schoolId', '==', schoolId).where('date', '==', date));
      currentCashReceived = calculateCollectedPaymentTotal(legacy.docs.map(document => document.data()), 'cash');
    }
    const counterRef = db.collection('counters').doc(`receipts_${schoolId}`);
    const counterSnap = await transaction.get(counterRef);
    const lastNumber = counterSnap.exists ? counterSnap.data()?.lastReceiptNumber : 0;
    if (typeof lastNumber !== 'number' || !Number.isSafeInteger(lastNumber) || lastNumber < 0) {
      throw httpsError('failed-precondition', 'Receipt counter is invalid.', 'RECEIPT_COUNTER_CORRUPTED');
    }
    const nextNumber = collectionInternals.safeAdd(lastNumber, 1, 'receiptNumber');
    const receiptNumber = `REC-${date.slice(0, 4)}-${String(nextNumber).padStart(4, '0')}`;
    const transportLine = lineItems.find(line => line.type === 'transport');
    const transportQuote = accountByKey.get('transport') as TransportCollectionQuote | undefined;
    const transportLines = lineItems.filter(line => line.type === 'transport');
    const plans = transportQuote ? transportLines.map(line => planTransportAllocations(
      transportQuote.installments.filter(item => !line.period || item.period === line.period)
        .map(item => ({ period: item.period, remainingBalance: item.remainingBalance })), line.amount)) : [];
    const transportPlan = plans.length ? { allocations: plans.flatMap(p => p.allocations),
      allocatedAmount: plans.reduce((sum, p) => collectionInternals.safeAdd(sum, p.allocatedAmount, 'transportAllocated'), 0),
      creditAmount: plans.reduce((sum, p) => collectionInternals.safeAdd(sum, p.creditAmount, 'transportCredit'), 0) } : null;
    const transportNewPaid = transportQuote ? collectionInternals.safeAdd(transportQuote.previousPaid,
      transportLines.reduce((sum, l) => collectionInternals.safeAdd(sum, l.amount, 'transportReceived'), 0), 'transportNewPaid') : 0;
    transportLines.forEach((line, i) => Object.assign(line, { allocations: plans[i].allocations }));
    if (transportPlan && transportLine && !transportLine.period) {
      transportLine.remainingBalance = transportQuote!.remainingBalance - transportPlan.allocatedAmount;
      transportLine.transportCredit = transportPlan.creditAmount;
      transportLine.newPaid = collectionInternals.safeAdd(transportQuote!.previousPaid, transportLine.amount, 'transportNewPaid');
      Object.assign(transportLine, { allocations: transportPlan.allocations });
    }
    const remainingBalance = lineItems.reduce((sum, line) =>
      collectionInternals.safeAdd(sum, line.remainingBalance, 'collectionRemaining'), 0);
    const fixture = base.student.testFixture === true && typeof base.student.testRunId === 'string'
      ? { testFixture: true, testRunId: base.student.testRunId } : {};
    const paymentData = { id: collectionId, paymentId: collectionId, collectionId, requestId,
      requestFingerprint: fingerprint, schoolId, studentId, academicYear, type: 'collection',
      amount: total, description, method: 'cash', status: 'completed', date, lineItems,
      createdBy: uid, createdAt: FieldValue.serverTimestamp(), byRecordCashPayment: true,
      remainingBalance, ...fixture };
    const receiptData = { ...paymentData, receiptNumber, paymentType: 'collection', paymentMethod: 'cash',
      studentName: base.student.name || '', studentRegistrationNumber: base.student.matricule || '',
      classId: base.student.classId || '', className: base.classData.name || '', schoolName: base.school.name || 'EcoScolaire',
      collectedByUserId: uid, collectedByName: base.user.name || base.user.displayName || base.user.email || uid,
      paymentDate: date };
    transaction.create(paymentRef, paymentData);
    writePendingFees(transaction, pendingFees);
    transaction.create(receiptRef, receiptData);
    transaction.set(counterRef, { lastReceiptNumber: nextNumber }, { merge: true });
    transaction.set(cashLedgerRef, { id: cashLedgerId, schoolId, date, status: 'open',
      cashReceived: collectionInternals.safeAdd(currentCashReceived, total, 'cashReceived'),
      updatedAt: FieldValue.serverTimestamp(), ...(!cashLedgerSnap.exists ? { createdAt: FieldValue.serverTimestamp() } : {})
    }, { merge: true });
    lineItems.forEach((line, index) => {
      const allocationId = collectionInternals.hashId('payment_allocation', [collectionId, index, line.key]);
      transaction.create(db.collection('paymentAllocations').doc(allocationId), { id: allocationId, allocationId,
        collectionId, paymentId: collectionId, receiptId: collectionId, schoolId, studentId, academicYear,
        ...line, status: 'POSTED', createdBy: uid, createdAt: FieldValue.serverTimestamp(), ...fixture });
    });
    if (transportPlan) transportPlan.allocations.forEach((allocation, index) => {
      const allocationId = collectionInternals.hashId('transport_allocation', [collectionId, index, allocation.kind, allocation.period]);
      transaction.create(db.collection('transportPaymentAllocations').doc(allocationId), { id: allocationId,
        allocationId, schoolId, studentId, academicYear, paymentId: collectionId, receiptId: collectionId,
        kind: allocation.kind, period: allocation.period, amount: allocation.amount, status: 'POSTED', sequence: index,
        createdBy: uid, createdAt: FieldValue.serverTimestamp(), byTransportPaymentEngine: true, ...fixture });
    });

    const pendingPayment = paymentData as Data;
    const financePatch: Data = {};
    const registration = lineItems.find(line => line.type === 'registration_fee');
    if (registration) Object.assign(financePatch, { registrationFeePaid: registration.newPaid,
      registrationFeeStatus: registration.remainingBalance === 0 ? 'paid' : 'partial' });
    if (lineItems.some(line => line.type === 'tuition')) Object.assign(financePatch,
      collectionInternals.buildTuitionProjection(base.finance, base.school, base.classData, base.benefits,
        base.payments, base.moratoriums, schoolId, academicYear, date, pendingPayment));
    if (transportPlan && transportQuote && transportLine) Object.assign(financePatch,
      collectionInternals.buildCanonicalTransportProjection(base.finance, transportQuote,
        transportPlan.allocations, transportNewPaid));
    const uniform = lineItems.find(line => line.type === 'uniforms');
    if (uniform) Object.assign(financePatch, { uniformExpected: uniform.netExpectedAmount,
      uniformPaid: uniform.newPaid, uniformStatus: uniform.remainingBalance === 0 ? 'paid' : 'partial' });
    const otherLines = lineItems.filter(line => line.type === 'other');
    if (otherLines.length) {
      const existing = base.finance.otherFeeBalances && typeof base.finance.otherFeeBalances === 'object'
        ? base.finance.otherFeeBalances as Data : {};
      const next = { ...existing };
      otherLines.forEach(line => { next[String(line.feeId)] = { label: line.label, expectedAmount: line.netExpectedAmount,
        paidAmount: line.newPaid, remainingBalance: line.remainingBalance,
        status: line.remainingBalance === 0 ? 'PAID' : 'PARTIAL' }; });
      financePatch.otherFeeBalances = next;
    }
    collectionInternals.writeStudentFinanceProjection({ transaction, financeRef: base.financeRef,
      financeSnapshot: base.financeSnap, studentId, schoolId, patch: financePatch, actorId: uid });

    const benefitTargets = new Map<string, { benefit: Data; targets: Set<string> }>();
    for (const line of lineItems) for (const snapshot of line.benefits) {
      const benefit = base.benefits.find(item => item.id === snapshot.benefitId);
      if (!benefit || benefit.legacy === true || !activeStatuses.has(String(benefit.status))) continue;
      const entry = benefitTargets.get(snapshot.benefitId) || { benefit, targets: new Set<string>() };
      if (line.type === 'transport' && transportPlan && transportQuote) {
        for (const allocation of transportPlan.allocations.filter(item => item.kind === 'INSTALLMENT')) {
          const installment = transportQuote.installments.find(item => item.period === allocation.period);
          if (installment?.benefits.some(item => item.benefitId === snapshot.benefitId)) {
            entry.targets.add(collectionInternals.makePaymentTargetKey('transport', null, installment.period));
          }
        }
      } else if (line.type === 'tuition') {
        entry.targets.add(collectionInternals.makePaymentTargetKey('tuition', line.installment, null));
      }
      benefitTargets.set(snapshot.benefitId, entry);
    }
    for (const [benefitId, entry] of benefitTargets) {
      const applied = Array.isArray(entry.benefit.appliedTargets) ? entry.benefit.appliedTargets as string[] : [];
      const newTargets = [...entry.targets].filter(target => !applied.includes(target));
      const usage = typeof entry.benefit.usageCount === 'number' ? entry.benefit.usageCount : 0;
      const maximum = typeof entry.benefit.maximumUses === 'number' ? entry.benefit.maximumUses : 1;
      if (usage + newTargets.length > maximum) throw httpsError('failed-precondition',
        'A financial benefit would exceed its approved uses.', 'BENEFIT_USAGE_CONFLICT');
      const patch: Data = { lastAppliedAt: FieldValue.serverTimestamp(), lastPaymentId: collectionId };
      if (newTargets.length) {
        patch.appliedTargets = FieldValue.arrayUnion(...newTargets);
        patch.usageCount = usage + newTargets.length;
        if (entry.benefit.status === 'approved') patch.status = 'applied';
      }
      transaction.update(db.collection('financialBenefits').doc(benefitId), patch);
    }
    transaction.create(db.collection('audit_logs').doc(), { ...collectionInternals.auditData(
      'PAYMENT_COLLECTION_CREATED', schoolId, uid, 'PAYMENT', collectionId,
      { amount: total, allocationCount: lineItems.length, receiptNumber }), ...fixture });
    transaction.create(db.collection('audit_logs').doc(), { ...collectionInternals.auditData(
      'RECEIPT_CREATED', schoolId, uid, 'RECEIPT', collectionId, { receiptNumber }), ...fixture });
    return { collectionId, paymentId: collectionId, receiptId: collectionId, receiptNumber,
      amount: total, lineItems, remainingBalance, idempotentReplay: false };
  });
});
