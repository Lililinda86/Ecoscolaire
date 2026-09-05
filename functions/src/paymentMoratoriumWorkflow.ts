import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import * as functions from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';
import { withAcademicYearTuitionDeadlines } from './secretaryCollections';

type Data = Record<string, unknown>;
type MoratoriumPaymentType = 'registration_fee' | 'tuition' | 'transport';
type Installment = 'T1' | 'T2' | 'T3';

const REQUEST_ROLES = new Set(['owner', 'director', 'secretary', 'superAdmin']);
const APPROVAL_ROLES = new Set(['owner', 'director', 'superAdmin']);
const INSTALLMENTS = new Set<Installment>(['T1', 'T2', 'T3']);

const httpsError = (
  code: functions.https.FunctionsErrorCode,
  message: string,
  businessCode?: string
): functions.https.HttpsError => new functions.https.HttpsError(
  code,
  message,
  businessCode ? { businessCode } : undefined
);

const requireId = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()
      || value.includes('/') || value.length > 128 || value === '.' || value === '..') {
    throw httpsError('invalid-argument', `${field} is invalid.`, 'INVALID_ARGUMENT');
  }
  return value;
};

const requireText = (value: unknown, field: string, min = 1, max = 500): string => {
  if (typeof value !== 'string') {
    throw httpsError('invalid-argument', `${field} is invalid.`, 'INVALID_ARGUMENT');
  }
  const clean = value.trim();
  if (clean.length < min || clean.length > max) {
    throw httpsError('invalid-argument', `${field} is invalid.`, 'INVALID_ARGUMENT');
  }
  return clean;
};

const isCalendarDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const requireDate = (value: unknown, field: string): string => {
  const clean = requireText(value, field, 10, 10);
  if (!isCalendarDate(clean)) {
    throw httpsError('invalid-argument', `${field} must use YYYY-MM-DD.`, 'INVALID_DATE');
  }
  return clean;
};

const requireAcademicYear = (value: unknown): string => {
  const clean = requireText(value, 'academicYear', 9, 9);
  if (!/^\d{4}-\d{4}$/.test(clean)) {
    throw httpsError('invalid-argument', 'academicYear must use YYYY-YYYY.', 'INVALID_ACADEMIC_YEAR');
  }
  const [start, end] = clean.split('-').map(Number);
  if (end !== start + 1) {
    throw httpsError('invalid-argument', 'academicYear is not consecutive.', 'INVALID_ACADEMIC_YEAR');
  }
  return clean;
};

const requireActiveUser = (
  snapshot: admin.firestore.DocumentSnapshot,
  roles: Set<string>
): Data => {
  if (!snapshot.exists) throw httpsError('permission-denied', 'Operator profile not found.', 'PERMISSION_DENIED');
  const user = snapshot.data() || {};
  const active = (user.active === true || user.isActive === true) && user.status !== 'inactive';
  if (!active || !roles.has(String(user.role))) {
    throw httpsError('permission-denied', 'Operator is not authorized.', 'PERMISSION_DENIED');
  }
  return user;
};

const validateTenant = (user: Data, schoolId: string): void => {
  if (user.role !== 'superAdmin' && user.schoolId !== schoolId) {
    throw httpsError('permission-denied', 'Cross-school operation denied.', 'CROSS_SCHOOL_DENIED');
  }
};

const auditData = (
  action: string,
  schoolId: string,
  uid: string,
  targetId: string,
  details: Data
): Data => ({
  action,
  schoolId,
  userId: uid,
  targetType: 'PAYMENT_MORATORIUM',
  targetId,
  details,
  timestamp: FieldValue.serverTimestamp(),
  createdAt: FieldValue.serverTimestamp()
});

const hashId = (prefix: string, values: unknown[]): string => `${prefix}_${crypto
  .createHash('sha256').update(JSON.stringify(values), 'utf8').digest('hex')}`;

const parseTarget = (raw: Data): {
  paymentType: MoratoriumPaymentType;
  installment: Installment | null;
  period: string | null;
} => {
  if (raw.paymentType !== 'registration_fee' && raw.paymentType !== 'tuition' && raw.paymentType !== 'transport') {
    throw httpsError('invalid-argument', 'paymentType is invalid.', 'INVALID_PAYMENT_TYPE');
  }
  if (raw.paymentType === 'tuition') {
    if (!INSTALLMENTS.has(raw.installment as Installment)) {
      throw httpsError('invalid-argument', 'installment is invalid.', 'INVALID_INSTALLMENT');
    }
    return { paymentType: 'tuition', installment: raw.installment as Installment, period: null };
  }
  if (raw.paymentType === 'transport') {
    const period = requireText(raw.period, 'period', 7, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      throw httpsError('invalid-argument', 'period must use YYYY-MM.', 'INVALID_TRANSPORT_PERIOD');
    }
    return { paymentType: 'transport', installment: null, period };
  }
  return { paymentType: 'registration_fee', installment: null, period: null };
};

const resolveOriginalDueDate = (
  school: Data,
  paymentType: MoratoriumPaymentType,
  installment: Installment | null,
  period: string | null
): string => {
  const deadlines = school.paymentDeadlines && typeof school.paymentDeadlines === 'object'
    ? school.paymentDeadlines as Data : {};
  let raw: unknown;
  if (paymentType === 'registration_fee') {
    raw = deadlines.registrationFee;
  } else if (paymentType === 'tuition') {
    const tuition = deadlines.tuition && typeof deadlines.tuition === 'object'
      ? deadlines.tuition as Data : {};
    raw = installment ? tuition[installment] : null;
  } else {
    const transport = deadlines.transport && typeof deadlines.transport === 'object'
      ? deadlines.transport as Data : {};
    raw = period ? transport[period] : null;
  }
  if (typeof raw !== 'string' || !isCalendarDate(raw)) {
    throw httpsError('failed-precondition', 'The target has no valid configured deadline.', 'PAYMENT_DEADLINE_UNCONFIGURED');
  }
  return raw;
};

const readContext = async (
  transaction: admin.firestore.Transaction,
  db: admin.firestore.Firestore,
  uid: string,
  schoolId: string,
  studentId: string,
  academicYear: string,
  roles: Set<string>
): Promise<{ user: Data; school: Data; student: Data }> => {
  const [userSnap, schoolSnap, studentSnap] = await Promise.all([
    transaction.get(db.collection('users').doc(uid)),
    transaction.get(db.collection('schools').doc(schoolId)),
    transaction.get(db.collection('students').doc(studentId))
  ]);
  const user = requireActiveUser(userSnap, roles);
  validateTenant(user, schoolId);
  if (!schoolSnap.exists) throw httpsError('not-found', 'School not found.', 'SCHOOL_NOT_FOUND');
  if (!studentSnap.exists) throw httpsError('not-found', 'Student not found.', 'STUDENT_NOT_FOUND');
  const school = schoolSnap.data() || {};
  const student = studentSnap.data() || {};
  if (student.schoolId !== schoolId) {
    throw httpsError('permission-denied', 'Student tenant mismatch.', 'CROSS_SCHOOL_DENIED');
  }
  if (school.active === false || school.isActive === false || school.status === 'inactive') {
    throw httpsError('failed-precondition', 'School is inactive.', 'SCHOOL_INACTIVE');
  }
  if (student.active === false || student.isActive === false || student.status === 'inactive') {
    throw httpsError('failed-precondition', 'Student is inactive.', 'STUDENT_INACTIVE');
  }
  const yearId = typeof school.activeAcademicYearId === 'string' ? school.activeAcademicYearId : '';
  const studentYearId = typeof student.academicYearId === 'string' ? student.academicYearId : yearId;
  const legacyYear = typeof student.registrationYear === 'string' ? student.registrationYear : student.academicYear;
  if (!yearId || studentYearId !== yearId || (legacyYear && legacyYear !== academicYear)) {
    throw httpsError('failed-precondition', 'Student academic year mismatch.', 'INVALID_ACADEMIC_YEAR');
  }
  const yearSnap = await transaction.get(db.collection('academicYears').doc(yearId));
  if (!yearSnap.exists) throw httpsError('failed-precondition', 'Academic year not found.', 'INVALID_ACADEMIC_YEAR');
  const year = yearSnap.data() || {};
  if (year.schoolId !== schoolId || year.name !== academicYear || year.status === 'inactive'
      || year.active === false || year.isActive === false) {
    throw httpsError('failed-precondition', 'Academic year mismatch.', 'INVALID_ACADEMIC_YEAR');
  }
  return { user, school: withAcademicYearTuitionDeadlines(school, year), student };
};

const sameTarget = (left: Data, right: Data): boolean =>
  left.paymentType === right.paymentType
  && (left.paymentType !== 'tuition' || left.installment === right.installment)
  && (left.paymentType !== 'transport' || left.period === right.period);

export const createPaymentMoratorium = functions.https.onCall(async (raw, context) => {
  if (!context.auth?.uid) throw httpsError('unauthenticated', 'Authentication required.', 'UNAUTHENTICATED');
  const source = (raw || {}) as Data;
  const schoolId = requireId(source.schoolId, 'schoolId');
  const studentId = requireId(source.studentId, 'studentId');
  const academicYear = requireAcademicYear(source.academicYear);
  const requestId = requireId(source.requestId, 'requestId');
  const target = parseTarget(source);
  const effectiveDueDate = requireDate(source.effectiveDueDate, 'effectiveDueDate');
  const reason = requireText(source.reason, 'reason', 3, 500);
  const input = { schoolId, studentId, academicYear, requestId, ...target, effectiveDueDate, reason };
  const id = hashId('moratorium', [schoolId, requestId]);
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(input), 'utf8').digest('hex');
  const uid = context.auth.uid;
  const db = admin.firestore();
  return db.runTransaction(async transaction => {
    const existingRef = db.collection('paymentMoratoriums').doc(id);
    const existingSnap = await transaction.get(existingRef);
    const { user, school } = await readContext(
      transaction, db, uid, schoolId, studentId, academicYear, REQUEST_ROLES
    );
    const originalDueDate = resolveOriginalDueDate(
      school, target.paymentType, target.installment, target.period
    );
    if (effectiveDueDate <= originalDueDate) {
      throw httpsError(
        'invalid-argument',
        'The new deadline must be later than the original deadline.',
        'INVALID_MORATORIUM_DATE'
      );
    }
    if (existingSnap.exists) {
      const existing = existingSnap.data() || {};
      if (existing.requestFingerprint !== fingerprint) {
        throw httpsError('already-exists', 'requestId already identifies another moratorium.', 'IDEMPOTENCY_CONFLICT');
      }
      return { moratoriumId: id, status: existing.status, idempotentReplay: true };
    }
    transaction.create(existingRef, {
      id, ...input, originalDueDate, status: 'draft', requestFingerprint: fingerprint,
      createdBy: uid, createdAt: FieldValue.serverTimestamp()
    });
    transaction.create(db.collection('audit_logs').doc(), auditData(
      'MORATORIUM_CREATED', schoolId, uid, id,
      { studentId, academicYear, ...target, originalDueDate, effectiveDueDate, reason, status: 'draft', role: user.role }
    ));
    return { moratoriumId: id, status: 'draft', idempotentReplay: false };
  });
});

export const submitPaymentMoratorium = functions.https.onCall(async (raw, context) => {
  if (!context.auth?.uid) throw httpsError('unauthenticated', 'Authentication required.', 'UNAUTHENTICATED');
  const moratoriumId = requireId((raw || {}).moratoriumId, 'moratoriumId');
  const uid = context.auth.uid;
  const db = admin.firestore();
  return db.runTransaction(async transaction => {
    const ref = db.collection('paymentMoratoriums').doc(moratoriumId);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw httpsError('not-found', 'Moratorium not found.', 'MORATORIUM_NOT_FOUND');
    const item = snapshot.data() || {};
    const { user } = await readContext(
      transaction, db, uid, String(item.schoolId), String(item.studentId),
      String(item.academicYear), REQUEST_ROLES
    );
    if (item.status === 'pending') return { moratoriumId, status: 'pending', idempotentReplay: true };
    if (item.status !== 'draft') {
      throw httpsError('failed-precondition', 'Moratorium is not submittable.', 'MORATORIUM_NOT_SUBMITTABLE');
    }
    transaction.update(ref, { status: 'pending', submittedBy: uid, submittedAt: FieldValue.serverTimestamp() });
    transaction.create(db.collection('audit_logs').doc(), auditData(
      'MORATORIUM_SUBMITTED', String(item.schoolId), uid, moratoriumId,
      { studentId: item.studentId, academicYear: item.academicYear, status: 'pending', role: user.role }
    ));
    return { moratoriumId, status: 'pending', idempotentReplay: false };
  });
});

export const approvePaymentMoratorium = functions.https.onCall(async (raw, context) => {
  if (!context.auth?.uid) throw httpsError('unauthenticated', 'Authentication required.', 'UNAUTHENTICATED');
  const moratoriumId = requireId((raw || {}).moratoriumId, 'moratoriumId');
  const uid = context.auth.uid;
  const db = admin.firestore();
  return db.runTransaction(async transaction => {
    const ref = db.collection('paymentMoratoriums').doc(moratoriumId);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw httpsError('not-found', 'Moratorium not found.', 'MORATORIUM_NOT_FOUND');
    const item = snapshot.data() || {};
    const { user, school } = await readContext(
      transaction, db, uid, String(item.schoolId), String(item.studentId),
      String(item.academicYear), APPROVAL_ROLES
    );
    if (item.status === 'approved') return { moratoriumId, status: 'approved', idempotentReplay: true };
    if (item.status !== 'pending' && item.status !== 'draft') {
      throw httpsError('failed-precondition', 'Moratorium is not approvable.', 'MORATORIUM_NOT_APPROVABLE');
    }
    const target = parseTarget(item);
    const originalDueDate = resolveOriginalDueDate(
      school, target.paymentType, target.installment, target.period
    );
    const effectiveDueDate = requireDate(item.effectiveDueDate, 'effectiveDueDate');
    if (effectiveDueDate <= originalDueDate) {
      throw httpsError('failed-precondition', 'Moratorium deadline is invalid.', 'INVALID_MORATORIUM_DATE');
    }
    const overlaps = await transaction.get(
      db.collection('paymentMoratoriums').where('studentId', '==', item.studentId)
    );
    const conflict = overlaps.docs
      .filter(document => document.id !== moratoriumId)
      .map(document => document.data() as Data)
      .find(other => other.schoolId === item.schoolId && other.academicYear === item.academicYear
        && other.status === 'approved' && sameTarget(item, other));
    if (conflict) {
      throw httpsError('failed-precondition', 'An approved moratorium already covers this deadline.', 'MORATORIUM_CONFLICT');
    }
    transaction.update(ref, {
      status: 'approved', originalDueDate, approvedBy: uid, approvedAt: FieldValue.serverTimestamp()
    });
    transaction.create(db.collection('audit_logs').doc(), auditData(
      'MORATORIUM_APPROVED', String(item.schoolId), uid, moratoriumId,
      {
        studentId: item.studentId, academicYear: item.academicYear, ...target,
        originalDueDate, effectiveDueDate, reason: item.reason, status: 'approved', role: user.role,
        financialAmountChanged: false
      }
    ));
    return { moratoriumId, status: 'approved', idempotentReplay: false };
  });
});

export const rejectPaymentMoratorium = functions.https.onCall(async (raw, context) => {
  if (!context.auth?.uid) throw httpsError('unauthenticated', 'Authentication required.', 'UNAUTHENTICATED');
  const moratoriumId = requireId((raw || {}).moratoriumId, 'moratoriumId');
  const reason = requireText((raw || {}).reason, 'reason', 3, 500);
  const uid = context.auth.uid;
  const db = admin.firestore();
  return db.runTransaction(async transaction => {
    const ref = db.collection('paymentMoratoriums').doc(moratoriumId);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw httpsError('not-found', 'Moratorium not found.', 'MORATORIUM_NOT_FOUND');
    const item = snapshot.data() || {};
    const { user } = await readContext(
      transaction, db, uid, String(item.schoolId), String(item.studentId),
      String(item.academicYear), APPROVAL_ROLES
    );
    if (item.status === 'rejected') return { moratoriumId, status: 'rejected', idempotentReplay: true };
    if (item.status !== 'pending') {
      throw httpsError('failed-precondition', 'Moratorium is not rejectable.', 'MORATORIUM_NOT_REJECTABLE');
    }
    transaction.update(ref, {
      status: 'rejected', rejectedBy: uid, rejectedAt: FieldValue.serverTimestamp(), rejectionReason: reason
    });
    transaction.create(db.collection('audit_logs').doc(), auditData(
      'MORATORIUM_REJECTED', String(item.schoolId), uid, moratoriumId,
      { studentId: item.studentId, academicYear: item.academicYear, reason, status: 'rejected', role: user.role }
    ));
    return { moratoriumId, status: 'rejected', idempotentReplay: false };
  });
});

