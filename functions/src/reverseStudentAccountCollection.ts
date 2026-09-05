import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import * as functions from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';
import { collectionInternals, TransportCollectionQuote } from './secretaryCollections';
import { buildAccountLines } from './studentAccountCollections';
import { calculateCollectedPaymentTotal } from './expenseLedger';
import { CASH_LEDGER_COLLECTION, CashLedgerIntegrityError, makeCashLedgerDayId, requireOpenCashLedger } from './cashClosureIntegrity';

type Data = Record<string, unknown>;

const httpsError = (code: functions.https.FunctionsErrorCode, message: string, businessCode: string) =>
  new functions.https.HttpsError(code, message, { businessCode });

const requestId = (value: unknown): string => {
  const id = collectionInternals.requireId(value, 'requestId');
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(id)) throw httpsError('invalid-argument', 'requestId is invalid.', 'INVALID_REQUEST_ID');
  return id;
};

export const reverseCashCollection = functions.https.onCall(async (raw, context) => {
  if (!context.auth?.uid) throw httpsError('unauthenticated', 'Authentication required.', 'UNAUTHENTICATED');
  const source = (raw || {}) as Data;
  const collectionId = collectionInternals.requireId(source.collectionId, 'collectionId');
  const reversalRequestId = requestId(source.requestId);
  const reason = collectionInternals.requireText(source.reason, 'reason', 3, 500);
  const uid = context.auth.uid;
  const reversalId = collectionInternals.hashId('collection_reversal', [collectionId]);
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ collectionId, reversalRequestId, reason }), 'utf8').digest('hex');
  const db = admin.firestore();

  return db.runTransaction(async transaction => {
    const userRef = db.collection('users').doc(uid);
    const originalRef = db.collection('payments').doc(collectionId);
    const originalReceiptRef = db.collection('receipts').doc(collectionId);
    const reversalRef = db.collection('payments').doc(reversalId);
    const correctionReceiptRef = db.collection('receipts').doc(reversalId);
    const transportAllocationsQuery = db.collection('transportPaymentAllocations').where('paymentId', '==', collectionId);
    const [userSnap, originalSnap, originalReceiptSnap, reversalSnap, correctionReceiptSnap, transportAllocationsSnap] =
      await Promise.all([transaction.get(userRef), transaction.get(originalRef), transaction.get(originalReceiptRef),
        transaction.get(reversalRef), transaction.get(correctionReceiptRef), transaction.get(transportAllocationsQuery)]);
    if (!userSnap.exists) throw httpsError('permission-denied', 'Operator profile not found.', 'PERMISSION_DENIED');
    const user = userSnap.data() || {};
    if (user.isActive === false || user.active === false || !['owner', 'superAdmin'].includes(String(user.role))) {
      throw httpsError('permission-denied', 'Only an owner can reverse a collection.', 'PERMISSION_DENIED');
    }
    if (reversalSnap.exists || correctionReceiptSnap.exists) {
      if (!reversalSnap.exists || !correctionReceiptSnap.exists
          || reversalSnap.data()?.requestFingerprint !== fingerprint
          || correctionReceiptSnap.data()?.requestFingerprint !== fingerprint) {
        throw httpsError('already-exists', 'This collection was already reversed.', 'PAYMENT_ALREADY_REVERSED');
      }
      return { collectionId, reversalId, correctionReceiptId: reversalId,
        correctionReceiptNumber: correctionReceiptSnap.data()?.receiptNumber,
        amount: reversalSnap.data()?.amount, idempotentReplay: true };
    }
    if (!originalSnap.exists || !originalReceiptSnap.exists) {
      throw httpsError('not-found', 'Collection or receipt not found.', 'PAYMENT_NOT_FOUND');
    }
    const original = originalSnap.data() || {};
    const originalReceipt = originalReceiptSnap.data() || {};
    if (original.type !== 'collection' || original.method !== 'cash' || original.status !== 'completed'
        || !Array.isArray(original.lineItems) || original.lineItems.length === 0
        || originalReceipt.paymentId !== collectionId) {
      throw httpsError('failed-precondition', 'The collection is not reversible.', 'PAYMENT_NOT_REVERSIBLE');
    }
    const schoolId = collectionInternals.requireId(original.schoolId, 'payment.schoolId');
    if (user.role !== 'superAdmin' && user.schoolId !== schoolId) {
      throw httpsError('permission-denied', 'Cross-school reversal denied.', 'CROSS_SCHOOL_DENIED');
    }
    const studentId = collectionInternals.requireId(original.studentId, 'payment.studentId');
    const academicYear = collectionInternals.requireAcademicYear(original.academicYear);
    const originalAmount = collectionInternals.requireMoney(original.amount, 'payment.amount');
    const { lines: currentLines, base } = await buildAccountLines(transaction, db, uid, schoolId, studentId, academicYear);
    const currentByKey = new Map(currentLines.map(line => [line.key, line]));
    const reversalLines: Data[] = (original.lineItems as Data[]).map((line, sequence): Data => {
      const key = collectionInternals.requireText(line.key, `lineItems[${sequence}].key`, 1, 160);
      const amount = collectionInternals.requireMoney(line.amount, `lineItems[${sequence}].amount`);
      const current = currentByKey.get(key);
      if (!current || current.previousPaid < amount) {
        throw httpsError('failed-precondition', 'Reversal would make a paid balance negative.', 'FINANCIAL_HISTORY_INCONSISTENT');
      }
      const allocatedAmount = typeof line.allocatedAmount === 'number' && Number.isSafeInteger(line.allocatedAmount)
        ? line.allocatedAmount : amount;
      return { ...line, sequence, amount: -amount, allocatedAmount: -allocatedAmount,
        transportCredit: typeof line.transportCredit === 'number' ? -line.transportCredit : 0,
        previousPaid: current.previousPaid, newPaid: current.previousPaid - amount,
        remainingBalance: current.remainingBalance + allocatedAmount, status: 'REVERSED' };
    });
    const reversedTotal = reversalLines.reduce((sum, line) =>
      collectionInternals.safeAdd(sum, Number(line.amount), 'reversalTotal'), 0);
    if (reversedTotal !== -originalAmount) {
      throw httpsError('failed-precondition', 'Collection lines do not match its total.', 'FINANCIAL_HISTORY_INCONSISTENT');
    }
    const date = collectionInternals.getDoualaDate();
    const cashLedgerId = makeCashLedgerDayId(schoolId, date);
    const cashLedgerRef = db.collection(CASH_LEDGER_COLLECTION).doc(cashLedgerId);
    const cashClosureRef = db.collection('cashClosures').doc(cashLedgerId);
    const [cashLedgerSnap, cashClosureSnap] = await Promise.all([transaction.get(cashLedgerRef), transaction.get(cashClosureRef)]);
    let cashReceived: number;
    try {
      cashReceived = requireOpenCashLedger(cashLedgerSnap.exists ? cashLedgerSnap.data() || {} : null,
        cashClosureSnap.exists, schoolId, date);
    } catch (error) {
      if (error instanceof CashLedgerIntegrityError) throw httpsError('failed-precondition', error.message, error.businessCode);
      throw error;
    }
    if (!cashLedgerSnap.exists) {
      const legacy = await transaction.get(db.collection('payments').where('schoolId', '==', schoolId).where('date', '==', date));
      cashReceived = calculateCollectedPaymentTotal(legacy.docs.map(document => document.data()), 'cash');
    }
    if (cashReceived < originalAmount) {
      throw httpsError('failed-precondition', 'The cash ledger cannot support this reversal.', 'CASH_LEDGER_INCONSISTENT');
    }
    const correctionNumber = `ANN-${String(originalReceipt.receiptNumber || collectionId)}`;
    const common = { id: reversalId, paymentId: reversalId, collectionId: reversalId,
      originalPaymentId: collectionId, originalReceiptId: collectionId, requestId: reversalRequestId,
      requestFingerprint: fingerprint, schoolId, studentId, academicYear, type: 'collection', amount: -originalAmount,
      originalAmount, reason, description: `Contre-opération: ${reason}`, method: 'cash', status: 'completed',
      kind: 'PAYMENT_REVERSAL', date, lineItems: reversalLines, createdBy: uid, createdByRole: user.role,
      createdAt: FieldValue.serverTimestamp(), byReversePayment: true };
    transaction.create(reversalRef, common);
    transaction.create(correctionReceiptRef, { ...common, receiptNumber: correctionNumber,
      paymentType: 'collection', paymentMethod: 'cash', studentName: base.student.name || originalReceipt.studentName || '',
      studentRegistrationNumber: base.student.matricule || originalReceipt.studentRegistrationNumber || '',
      classId: base.student.classId || originalReceipt.classId || '', className: base.classData.name || originalReceipt.className || '',
      schoolName: base.school.name || originalReceipt.schoolName || 'EcoScolaire', correctedByUserId: uid,
      correctedByRole: user.role, paymentDate: date });
    reversalLines.forEach((line, index) => {
      const allocationId = collectionInternals.hashId('payment_allocation_reversal', [reversalId, index, String(line.key)]);
      transaction.create(db.collection('paymentAllocations').doc(allocationId), { id: allocationId, allocationId,
        collectionId: reversalId, paymentId: reversalId, receiptId: reversalId, originalPaymentId: collectionId,
        schoolId, studentId, academicYear, ...line, status: 'POSTED', createdBy: uid,
        createdAt: FieldValue.serverTimestamp(), byReversePayment: true });
    });
    const reversedTransportAllocations = transportAllocationsSnap.docs.map(document => document.data() as Data);
    reversedTransportAllocations.forEach((allocation, index) => {
      const amount = collectionInternals.requireMoney(allocation.amount, `transportAllocation[${index}].amount`);
      const allocationId = collectionInternals.hashId('transport_allocation_reversal', [reversalId, index]);
      transaction.create(db.collection('transportPaymentAllocations').doc(allocationId), { ...allocation,
        id: allocationId, allocationId, paymentId: reversalId, receiptId: reversalId, originalPaymentId: collectionId,
        amount: -amount, createdBy: uid, createdAt: FieldValue.serverTimestamp(), byReversePayment: true });
    });
    transaction.set(cashLedgerRef, { id: cashLedgerId, schoolId, date, status: 'open',
      cashReceived: cashReceived - originalAmount, updatedAt: FieldValue.serverTimestamp(),
      ...(!cashLedgerSnap.exists ? { createdAt: FieldValue.serverTimestamp() } : {}) }, { merge: true });

    const financePatch: Data = {};
    const registration = reversalLines.find(line => line.type === 'registration_fee');
    if (registration) Object.assign(financePatch, { registrationFeePaid: registration.newPaid,
      registrationFeeStatus: registration.newPaid === 0 ? 'unpaid' : 'partial' });
    if (reversalLines.some(line => line.type === 'tuition')) Object.assign(financePatch,
      collectionInternals.buildTuitionProjection(base.finance, base.school, base.classData, base.benefits,
        base.payments, base.moratoriums, schoolId, academicYear, date, common));
    const transportLine = reversalLines.find(line => line.type === 'transport');
    const transportQuote = currentByKey.get('transport') as TransportCollectionQuote | undefined;
    if (transportLine && transportQuote) Object.assign(financePatch,
      collectionInternals.buildCanonicalTransportProjection(base.finance, transportQuote,
        reversedTransportAllocations.map(allocation => ({ kind: allocation.kind as 'INSTALLMENT' | 'CREDIT',
          period: typeof allocation.period === 'string' ? allocation.period : null,
          amount: -Number(allocation.amount) })), Number(transportLine.newPaid)));
    const uniform = reversalLines.find(line => line.type === 'uniforms');
    if (uniform) Object.assign(financePatch, { uniformExpected: uniform.netExpectedAmount,
      uniformPaid: uniform.newPaid, uniformStatus: uniform.newPaid === 0 ? 'unpaid' : 'partial' });
    const otherLines = reversalLines.filter(line => line.type === 'other');
    if (otherLines.length) {
      const existing = base.finance.otherFeeBalances && typeof base.finance.otherFeeBalances === 'object'
        ? base.finance.otherFeeBalances as Data : {};
      const next = { ...existing };
      otherLines.forEach(line => { next[String(line.feeId)] = { label: line.label,
        expectedAmount: line.netExpectedAmount, paidAmount: line.newPaid,
        remainingBalance: line.remainingBalance, status: line.newPaid === 0 ? 'UNPAID' : 'PARTIAL' }; });
      financePatch.otherFeeBalances = next;
    }
    collectionInternals.writeStudentFinanceProjection({ transaction, financeRef: base.financeRef,
      financeSnapshot: base.financeSnap, studentId, schoolId, patch: financePatch, actorId: uid });
    transaction.create(db.collection('audit_logs').doc(), collectionInternals.auditData(
      'PAYMENT_COLLECTION_REVERSED', schoolId, uid, 'PAYMENT', collectionId,
      { reversalId, correctionReceiptId: reversalId, amount: originalAmount, reason }));
    return { collectionId, reversalId, correctionReceiptId: reversalId,
      correctionReceiptNumber: correctionNumber, amount: -originalAmount, idempotentReplay: false };
  });
});
