import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import * as functions from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';

type Data = Record<string, unknown>;

type Snapshot = {
  exists: boolean;
  data: Data | undefined;
};

export type StudentAttendanceTransaction = {
  getUser: (uid: string) => Promise<Snapshot>;
  getStudent: (studentId: string) => Promise<Snapshot>;
  getClass: (classId: string) => Promise<Snapshot>;
  getSchool: (schoolId: string) => Promise<Snapshot>;
  getStaffLink: (uid: string) => Promise<Snapshot>;
  getTeacherSlots: (staffId: string) => Promise<Data[]>;
  getAttendance: (attendanceId: string) => Promise<Snapshot>;
  setAttendance: (attendanceId: string, record: Data) => void;
  createAudit: (auditId: string, record: Data) => void;
};

export type StudentAttendanceDependencies = {
  runTransaction: <T>(handler: (transaction: StudentAttendanceTransaction) => Promise<T>) => Promise<T>;
  newAuditId: () => string;
  serverTimestamp: () => unknown;
  nowIso: () => string;
};

type AttendanceAuth = { uid: string };

export const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'left_early'] as const;
export type CanonicalAttendanceStatus = typeof ATTENDANCE_STATUSES[number];

const MANAGER_ROLES = new Set(['superAdmin', 'owner', 'director', 'secretary']);
const TERMINAL_STUDENT_STATUSES = new Set(['departed', 'excluded', 'inactive']);

const httpsError = (
  code: functions.https.FunctionsErrorCode,
  message: string,
): functions.https.HttpsError => new functions.https.HttpsError(code, message);

const stringField = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

const activeUser = (user: Data): boolean =>
  user.active === true || user.isActive === true || user.status === 'active';

const activeStudent = (student: Data): boolean =>
  student.active !== false
  && student.isActive !== false
  && stringField(student.status).toLowerCase() !== 'inactive'
  && !TERMINAL_STUDENT_STATUSES.has(stringField(student.schoolingStatus).toLowerCase());

const activeClass = (row: Data): boolean =>
  row.active !== false && row.isActive !== false && stringField(row.status).toLowerCase() !== 'inactive';

const requirePlainObject = (value: unknown): Data => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw httpsError('invalid-argument', 'payload must be an object.');
  }
  const payload = value as Data;
  const allowed = new Set(['studentId', 'date', 'status', 'note']);
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

export const requireSchoolDate = (value: unknown): string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw httpsError('invalid-argument', 'date must use YYYY-MM-DD.');
  }
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw httpsError('invalid-argument', 'date is not a valid school date.');
  }
  return value;
};

const requireStatus = (value: unknown): CanonicalAttendanceStatus => {
  if (typeof value !== 'string' || !ATTENDANCE_STATUSES.includes(value as CanonicalAttendanceStatus)) {
    throw httpsError('invalid-argument', 'status is not supported.');
  }
  return value as CanonicalAttendanceStatus;
};

const requireNote = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.length > 500) {
    throw httpsError('invalid-argument', 'note must be a string of at most 500 characters.');
  }
  return value.trim();
};

export const attendanceDocumentId = (
  schoolId: string,
  academicYearId: string,
  date: string,
  studentId: string,
): string => `att_${crypto.createHash('sha256')
  .update(`${schoolId}\u001f${academicYearId}\u001f${date}\u001f${studentId}`, 'utf8')
  .digest('hex')}`;

const isPresent = (status: CanonicalAttendanceStatus): boolean =>
  status === 'present' || status === 'late';

export const handleRecordStudentAttendance = async (
  raw: unknown,
  auth: AttendanceAuth | undefined,
  dependencies: StudentAttendanceDependencies,
): Promise<{
  success: true;
  changed: boolean;
  corrected: boolean;
  attendance: Data;
}> => {
  if (!auth?.uid) throw httpsError('unauthenticated', 'Authentication required.');

  const payload = requirePlainObject(raw);
  const studentId = requireId(payload.studentId, 'studentId');
  const date = requireSchoolDate(payload.date);
  const status = requireStatus(payload.status);
  const note = requireNote(payload.note);

  return dependencies.runTransaction(async transaction => {
    const userSnapshot = await transaction.getUser(auth.uid);
    const user = userSnapshot.data;
    if (!userSnapshot.exists || !user || !activeUser(user)) {
      throw httpsError('permission-denied', 'Active user profile required.');
    }

    const actorRole = stringField(user.role);
    if (!MANAGER_ROLES.has(actorRole) && actorRole !== 'teacher') {
      throw httpsError('permission-denied', 'Role is not allowed to record attendance.');
    }

    const studentSnapshot = await transaction.getStudent(studentId);
    const student = studentSnapshot.data;
    if (!studentSnapshot.exists || !student) throw httpsError('not-found', 'Student not found.');
    if (!activeStudent(student)) throw httpsError('failed-precondition', 'Student is inactive.');

    const schoolId = stringField(student.schoolId);
    const classId = stringField(student.classId);
    if (!schoolId || !classId) throw httpsError('failed-precondition', 'Student school and class are required.');

    const classSnapshot = await transaction.getClass(classId);
    const classData = classSnapshot.data;
    if (!classSnapshot.exists || !classData) throw httpsError('failed-precondition', 'Student class was not found.');
    if (stringField(classData.schoolId) !== schoolId || !activeClass(classData)) {
      throw httpsError('failed-precondition', 'Student class is invalid or inactive.');
    }

    const schoolSnapshot = await transaction.getSchool(schoolId);
    const school = schoolSnapshot.data;
    if (!schoolSnapshot.exists || !school) throw httpsError('failed-precondition', 'Student school was not found.');
    const academicYearId = stringField(school.activeAcademicYearId);
    if (!academicYearId) throw httpsError('failed-precondition', 'No canonical active academic year is configured.');

    const actorSchoolId = stringField(user.schoolId);
    if (MANAGER_ROLES.has(actorRole)) {
      if (actorRole !== 'superAdmin' && actorSchoolId !== schoolId) {
        throw httpsError('permission-denied', 'User does not belong to the student school.');
      }
      if (actorRole === 'superAdmin' && actorSchoolId && actorSchoolId !== schoolId) {
        throw httpsError('permission-denied', 'Scoped superAdmin does not belong to the student school.');
      }
    } else {
      if (actorSchoolId !== schoolId) {
        throw httpsError('permission-denied', 'Teacher does not belong to the student school.');
      }
      const staffLinkSnapshot = await transaction.getStaffLink(auth.uid);
      const staffLink = staffLinkSnapshot.data;
      if (!staffLinkSnapshot.exists || !staffLink || staffLink.isActive !== true
          || stringField(staffLink.schoolId) !== schoolId || !stringField(staffLink.staffId)) {
        throw httpsError('permission-denied', 'Active teacher staff link required.');
      }
      const teacherSlots = await transaction.getTeacherSlots(stringField(staffLink.staffId));
      const assigned = teacherSlots.some(slot => slot.isActive === true
        && stringField(slot.schoolId) === schoolId
        && stringField(slot.academicYearId) === academicYearId
        && stringField(slot.classId) === classId
        && stringField(slot.teacherStaffId) === stringField(staffLink.staffId));
      if (!assigned) throw httpsError('permission-denied', 'Teacher is not assigned to the student class.');
    }

    const attendanceId = attendanceDocumentId(schoolId, academicYearId, date, studentId);
    const attendanceSnapshot = await transaction.getAttendance(attendanceId);
    const existing = attendanceSnapshot.data;
    const previousStatus = existing ? stringField(existing.status) : '';
    const previousNote = existing ? stringField(existing.note || existing.reason) : '';
    const changed = !existing || previousStatus !== status || previousNote !== note;
    const corrected = Boolean(existing && changed);

    const nowIso = dependencies.nowIso();
    const fixtureSource = student.testFixture === true ? student : user;
    const fixtureFields = fixtureSource.testFixture === true && stringField(fixtureSource.testRunId)
      ? { testFixture: true, testRunId: stringField(fixtureSource.testRunId) }
      : {};
    const publicRecord: Data = {
      id: attendanceId,
      schoolId,
      academicYearId,
      classId,
      studentId,
      date,
      status,
      present: isPresent(status),
      note,
      reason: note,
      canonicalAttendance: true,
      version: existing && typeof existing.version === 'number' ? existing.version + (changed ? 1 : 0) : 1,
      createdBy: existing ? existing.createdBy : auth.uid,
      updatedBy: auth.uid,
      updatedAt: nowIso,
      ...(corrected ? { correctedAt: nowIso } : {}),
      ...fixtureFields,
    };

    if (!changed) return { success: true, changed: false, corrected: false, attendance: publicRecord };

    const timestamp = dependencies.serverTimestamp();
    transaction.setAttendance(attendanceId, {
      ...publicRecord,
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
      ...(corrected ? { correctedAt: timestamp } : {}),
    });

    const audit: Data = {
      action: corrected ? 'ATTENDANCE_CORRECTED' : 'ATTENDANCE_RECORDED',
      attendanceId,
      studentId,
      date,
      previousStatus: previousStatus || null,
      newStatus: status,
      actorUid: auth.uid,
      actorRole,
      schoolId,
      userId: auth.uid,
      userRole: actorRole,
      userEmail: '',
      targetType: 'ATTENDANCE',
      targetId: attendanceId,
      details: { attendanceId, studentId, date, previousStatus: previousStatus || null, newStatus: status },
      createdAt: timestamp,
      timestamp: nowIso,
      canonicalBackendAudit: true,
    };
    if (fixtureFields.testFixture === true) {
      audit.testFixture = true;
      audit.testRunId = fixtureFields.testRunId;
    }
    transaction.createAudit(dependencies.newAuditId(), audit);

    return { success: true, changed: true, corrected, attendance: publicRecord };
  });
};

const productionDependencies: StudentAttendanceDependencies = {
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
      getSchool: async schoolId => {
        const snapshot = await nativeTransaction.get(db.collection('schools').doc(schoolId));
        return { exists: snapshot.exists, data: snapshot.data() };
      },
      getStaffLink: async uid => {
        const snapshot = await nativeTransaction.get(db.collection('staffUserLinkByUser').doc(uid));
        return { exists: snapshot.exists, data: snapshot.data() };
      },
      getTeacherSlots: async staffId => {
        const snapshot = await nativeTransaction.get(
          db.collection('teacherAssignmentSlots').where('teacherStaffId', '==', staffId),
        );
        return snapshot.docs.map(document => document.data());
      },
      getAttendance: async attendanceId => {
        const snapshot = await nativeTransaction.get(db.collection('attendance').doc(attendanceId));
        return { exists: snapshot.exists, data: snapshot.data() };
      },
      setAttendance: (attendanceId, record) => nativeTransaction.set(
        db.collection('attendance').doc(attendanceId), record,
      ),
      createAudit: (auditId, record) => nativeTransaction.create(db.collection('audit_logs').doc(auditId), record),
    });
  }),
};

export const recordStudentAttendance = functions.https.onCall(async (data, context) =>
  handleRecordStudentAttendance(data, context.auth, productionDependencies));
