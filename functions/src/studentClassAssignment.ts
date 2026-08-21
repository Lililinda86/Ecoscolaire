import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';

type Data = Record<string, unknown>;

type Snapshot = {
  exists: boolean;
  data: Data | undefined;
};

export type StudentClassAssignmentTransaction = {
  getUser: (uid: string) => Promise<Snapshot>;
  getStudent: (studentId: string) => Promise<Snapshot>;
  getClass: (classId: string) => Promise<Snapshot>;
  updateStudent: (studentId: string, patch: Data) => void;
  createAudit: (auditId: string, record: Data) => void;
};

export type StudentClassAssignmentDependencies = {
  runTransaction: <T>(handler: (transaction: StudentClassAssignmentTransaction) => Promise<T>) => Promise<T>;
  newAuditId: () => string;
  serverTimestamp: () => unknown;
  nowIso: () => string;
};

type AssignmentAuth = {
  uid: string;
};

const ALLOWED_ROLES = new Set(['superAdmin', 'owner', 'director', 'secretary']);
const CANONICAL_SECTIONS = new Set(['francophone', 'anglophone']);

const httpsError = (
  code: functions.https.FunctionsErrorCode,
  message: string,
): functions.https.HttpsError => new functions.https.HttpsError(code, message);

const requirePlainObject = (value: unknown): Data => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw httpsError('invalid-argument', 'payload must be an object.');
  }
  const payload = value as Data;
  const allowed = new Set(['studentId', 'targetClassId']);
  const unexpected = Object.keys(payload).filter(key => !allowed.has(key));
  if (unexpected.length > 0) {
    throw httpsError('invalid-argument', `Unsupported fields: ${unexpected.join(', ')}.`);
  }
  return payload;
};

const requireId = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value !== value.trim() || value.length < 1 || value.length > 512
      // eslint-disable-next-line no-control-regex
      || /[\u0000-\u001f\u007f/]/.test(value)) {
    throw httpsError('invalid-argument', `${field} is invalid.`);
  }
  return value;
};

const activeUser = (user: Data): boolean =>
  user.active === true || user.isActive === true || user.status === 'active';

const stringField = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

const canonicalSection = (row: Data): string | null => {
  const values = [row.section, row.type]
    .map(value => stringField(value).toLowerCase());
  return values.find(value => CANONICAL_SECTIONS.has(value)) || null;
};

export const handleAssignStudentToClass = async (
  raw: unknown,
  auth: AssignmentAuth | undefined,
  dependencies: StudentClassAssignmentDependencies,
): Promise<{
  success: true;
  changed: boolean;
  studentId: string;
  previousClassId: string | null;
  classId: string;
  schoolId: string;
}> => {
  if (!auth?.uid) {
    throw httpsError('unauthenticated', 'Authentication required.');
  }

  const payload = requirePlainObject(raw);
  const studentId = requireId(payload.studentId, 'studentId');
  const targetClassId = requireId(payload.targetClassId, 'targetClassId');

  return dependencies.runTransaction(async transaction => {
    const userSnapshot = await transaction.getUser(auth.uid);
    const user = userSnapshot.data;
    if (!userSnapshot.exists || !user || !activeUser(user)) {
      throw httpsError('permission-denied', 'Active user profile required.');
    }

    const actorRole = stringField(user.role);
    if (!ALLOWED_ROLES.has(actorRole)) {
      throw httpsError('permission-denied', 'Role is not allowed to assign students.');
    }

    const studentSnapshot = await transaction.getStudent(studentId);
    const targetClassSnapshot = await transaction.getClass(targetClassId);
    if (!studentSnapshot.exists || !studentSnapshot.data) {
      throw httpsError('not-found', 'Student not found.');
    }
    if (!targetClassSnapshot.exists || !targetClassSnapshot.data) {
      throw httpsError('not-found', 'Class not found.');
    }

    const student = studentSnapshot.data;
    const targetClass = targetClassSnapshot.data;
    const schoolId = stringField(student.schoolId);
    const classSchoolId = stringField(targetClass.schoolId);
    const actorSchoolId = stringField(user.schoolId);
    if (!schoolId || !classSchoolId || classSchoolId !== schoolId) {
      throw httpsError('failed-precondition', 'Student and class must belong to the same school.');
    }
    if (actorRole !== 'superAdmin' && actorSchoolId !== schoolId) {
      throw httpsError('permission-denied', 'User does not belong to the student school.');
    }
    if (actorRole === 'superAdmin' && actorSchoolId && actorSchoolId !== schoolId) {
      throw httpsError('permission-denied', 'Scoped superAdmin does not belong to the student school.');
    }
    if (targetClass.isActive === false || targetClass.active === false || targetClass.status === 'inactive') {
      throw httpsError('failed-precondition', 'Target class is inactive.');
    }

    const studentSection = canonicalSection(student);
    const targetSection = canonicalSection(targetClass);
    if (studentSection && targetSection && studentSection !== targetSection) {
      throw httpsError('failed-precondition', 'Student and class sections are inconsistent.');
    }

    const previousClassId = stringField(student.classId) || null;
    if (previousClassId === targetClassId) {
      return { success: true, changed: false, studentId, previousClassId, classId: targetClassId, schoolId };
    }

    const timestamp = dependencies.serverTimestamp();
    transaction.updateStudent(studentId, {
      classId: targetClassId,
      updatedAt: timestamp,
      updatedBy: auth.uid,
    });

    const audit: Data = {
      action: 'STUDENT_CLASS_CHANGED',
      actorUid: auth.uid,
      actorRole,
      schoolId,
      userId: auth.uid,
      userRole: actorRole,
      userEmail: '',
      targetType: 'STUDENT',
      targetId: studentId,
      targetName: studentId,
      details: { studentId, previousClassId, newClassId: targetClassId },
      createdAt: timestamp,
      timestamp: dependencies.nowIso(),
      canonicalBackendAudit: true,
    };
    const fixtureSource = student.testFixture === true ? student : user;
    if (fixtureSource.testFixture === true && stringField(fixtureSource.testRunId)) {
      audit.testFixture = true;
      audit.testRunId = stringField(fixtureSource.testRunId);
    }
    transaction.createAudit(dependencies.newAuditId(), audit);

    return { success: true, changed: true, studentId, previousClassId, classId: targetClassId, schoolId };
  });
};

const productionDependencies: StudentClassAssignmentDependencies = {
  newAuditId: () => admin.firestore().collection('audit_logs').doc().id,
  serverTimestamp: () => FieldValue.serverTimestamp(),
  nowIso: () => new Date().toISOString(),
  runTransaction: handler => admin.firestore().runTransaction(async nativeTransaction => {
    const db = admin.firestore();
    return handler({
      getUser: async uid => {
        const snapshot = await nativeTransaction.get(db.collection('users').doc(uid));
        return { exists: snapshot.exists, data: snapshot.data() };
      },
      getStudent: async studentId => {
        const snapshot = await nativeTransaction.get(db.collection('students').doc(studentId));
        return { exists: snapshot.exists, data: snapshot.data() };
      },
      getClass: async classId => {
        const snapshot = await nativeTransaction.get(db.collection('classes').doc(classId));
        return { exists: snapshot.exists, data: snapshot.data() };
      },
      updateStudent: (studentId, patch) => nativeTransaction.update(db.collection('students').doc(studentId), patch),
      createAudit: (auditId, record) => nativeTransaction.create(db.collection('audit_logs').doc(auditId), record),
    });
  }),
};

export const assignStudentToClass = functions.https.onCall(async (data, context) =>
  handleAssignStudentToClass(data, context.auth, productionDependencies));
