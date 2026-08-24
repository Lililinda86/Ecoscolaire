import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';

type Data = Record<string, unknown>;
type Action = 'CREATE_DRAFT' | 'UPDATE_DRAFT' | 'ACTIVATE' | 'DEACTIVATE';

const MANAGER_ROLES = new Set(['superAdmin', 'owner', 'director']);
const DRAFT_ROLES = new Set([...MANAGER_ROLES, 'secretary']);
const ACTIONS = new Set<Action>(['CREATE_DRAFT', 'UPDATE_DRAFT', 'ACTIVATE', 'DEACTIVATE']);
const ALLOWED_FIELDS = new Set([
  'action', 'schoolId', 'assignmentId', 'academicYearId', 'classId', 'subjectId',
  'teacherStaffId', 'note', 'reason', 'testFixture', 'testRunId',
]);

const failure = (code: functions.https.FunctionsErrorCode, message: string, businessCode: string) =>
  new functions.https.HttpsError(code, message, { businessCode });

const object = (value: unknown): Data => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw failure('invalid-argument', 'Le payload doit être un objet.', 'INVALID_ARGUMENT');
  }
  const result = value as Data;
  const unsupported = Object.keys(result).filter(key => !ALLOWED_FIELDS.has(key));
  if (unsupported.length) throw failure('invalid-argument', 'Payload non autorisé.', 'INVALID_ARGUMENT');
  return result;
};

const id = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value !== value.trim() || !value || value.length > 128
      || value.includes('/')
      // eslint-disable-next-line no-control-regex
      || /[\u0000-\u001f\u007f]/.test(value)) {
    throw failure('invalid-argument', `${field} est invalide.`, 'INVALID_ARGUMENT');
  }
  return value;
};

const optionalText = (value: unknown, field: string, max = 500): string => {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.length > max) {
    throw failure('invalid-argument', `${field} est invalide.`, 'INVALID_ARGUMENT');
  }
  return value.trim();
};

const active = (row: Data): boolean => {
  const status = String(row.status || '').toLowerCase();
  if (row.active === false || row.isActive === false
      || ['inactive', 'inactif', 'archived', 'archive'].includes(status)) return false;
  return row.active === true || row.isActive === true || status === 'active' || status === 'actif';
};

const assignmentIdFor = (schoolId: string, academicYearId: string, classId: string, subjectId: string, staffId: string) =>
  `${schoolId}__${academicYearId}__${classId}__${subjectId}__${staffId}`;

export const manageTeacherAssignment = functions.https.onCall(async (raw, context) => {
  if (!context.auth?.uid) throw failure('unauthenticated', 'Authentification requise.', 'UNAUTHENTICATED');
  const payload = object(raw);
  if (typeof payload.action !== 'string' || !ACTIONS.has(payload.action as Action)) {
    throw failure('invalid-argument', 'Action d’affectation invalide.', 'INVALID_ACTION');
  }
  const action = payload.action as Action;
  const uid = context.auth.uid;
  const db = admin.firestore();
  const actorSnap = await db.collection('users').doc(uid).get();
  const actor = actorSnap.data() as Data | undefined;
  if (!actorSnap.exists || !actor || !active(actor)) {
    throw failure('permission-denied', 'Compte opérateur actif requis.', 'PERMISSION_DENIED');
  }
  const role = typeof actor.role === 'string' ? actor.role : '';
  const allowedRoles = action === 'CREATE_DRAFT' || action === 'UPDATE_DRAFT' ? DRAFT_ROLES : MANAGER_ROLES;
  if (!allowedRoles.has(role)) throw failure('permission-denied', 'Rôle non autorisé.', 'PERMISSION_DENIED');
  const actorSchoolId = typeof actor.schoolId === 'string' ? actor.schoolId.trim() : '';
  const requestedSchoolId = payload.schoolId === undefined ? '' : id(payload.schoolId, 'schoolId');
  const schoolId = role === 'superAdmin' ? (actorSchoolId || requestedSchoolId) : actorSchoolId;
  if (!schoolId || (requestedSchoolId && requestedSchoolId !== schoolId)) {
    throw failure('permission-denied', 'École cible non autorisée.', 'SCHOOL_MISMATCH');
  }

  const assignmentId = action === 'CREATE_DRAFT' ? '' : id(payload.assignmentId, 'assignmentId');
  const academicYearId = action === 'CREATE_DRAFT' ? id(payload.academicYearId, 'academicYearId') : '';
  const classId = action === 'CREATE_DRAFT' ? id(payload.classId, 'classId') : '';
  const subjectId = action === 'CREATE_DRAFT' ? id(payload.subjectId, 'subjectId') : '';
  const teacherStaffId = action === 'CREATE_DRAFT' ? id(payload.teacherStaffId, 'teacherStaffId') : '';
  const note = optionalText(payload.note, 'note');
  const reason = optionalText(payload.reason, 'reason');
  const fixture = payload.testFixture === true || payload.testRunId !== undefined
    ? { testFixture: true, testRunId: id(payload.testRunId, 'testRunId') }
    : {};
  if (payload.testFixture !== undefined && payload.testFixture !== true) {
    throw failure('invalid-argument', 'testFixture doit valoir true.', 'INVALID_FIXTURE');
  }
  if (process.env.GCLOUD_PROJECT === 'ecoscolaire-c5861' && fixture.testFixture === true
      && (actor.testFixture !== true || actor.testRunId !== fixture.testRunId)) {
    throw failure('permission-denied', 'Fixture Production non autorisée.', 'FIXTURE_FORBIDDEN');
  }

  const requestedRef = action === 'CREATE_DRAFT'
    ? db.collection('teacherAssignments').doc(assignmentIdFor(schoolId, academicYearId, classId, subjectId, teacherStaffId))
    : db.collection('teacherAssignments').doc(assignmentId);
  const nowIso = new Date().toISOString();

  return db.runTransaction(async transaction => {
    const requestedSnap = await transaction.get(requestedRef);
    const existing = requestedSnap.data() as Data | undefined;
    if (action === 'CREATE_DRAFT' && requestedSnap.exists) {
      if (existing?.schoolId !== schoolId) throw failure('permission-denied', 'Accès inter-école refusé.', 'SCHOOL_MISMATCH');
      return { success: true, changed: false, assignment: existing };
    }
    if (action !== 'CREATE_DRAFT' && (!requestedSnap.exists || !existing)) {
      throw failure('not-found', 'Affectation introuvable.', 'ASSIGNMENT_NOT_FOUND');
    }
    if (existing && existing.schoolId !== schoolId) {
      throw failure('permission-denied', 'Accès inter-école refusé.', 'SCHOOL_MISMATCH');
    }

    const effectiveYearId = action === 'CREATE_DRAFT' ? academicYearId : id(existing?.academicYearId, 'academicYearId');
    const effectiveClassId = action === 'CREATE_DRAFT' ? classId : id(existing?.classId, 'classId');
    const effectiveSubjectId = action === 'CREATE_DRAFT' ? subjectId : id(existing?.subjectId, 'subjectId');
    const effectiveStaffId = action === 'CREATE_DRAFT' ? teacherStaffId : id(existing?.teacherStaffId, 'teacherStaffId');
    const yearRef = db.collection('academicYears').doc(effectiveYearId);
    const classRef = db.collection('classes').doc(effectiveClassId);
    const subjectRef = db.collection('subjects').doc(effectiveSubjectId);
    const staffRef = db.collection('staff').doc(effectiveStaffId);
    const linkByStaffRef = db.collection('staffUserLinkByStaff').doc(`${schoolId}__${effectiveStaffId}`);
    const [yearSnap, classSnap, subjectSnap, staffSnap, linkByStaffSnap, programsSnap] = await Promise.all([
      transaction.get(yearRef), transaction.get(classRef), transaction.get(subjectRef), transaction.get(staffRef),
      transaction.get(linkByStaffRef),
      transaction.get(db.collection('classPrograms').where('schoolId', '==', schoolId)
        .where('academicYearId', '==', effectiveYearId).where('classId', '==', effectiveClassId)),
    ]);
    if (!yearSnap.exists) throw failure('not-found', 'Année scolaire introuvable.', 'ACADEMIC_YEAR_NOT_FOUND');
    if (!classSnap.exists) throw failure('not-found', 'Classe introuvable.', 'CLASS_NOT_FOUND');
    if (!subjectSnap.exists) throw failure('not-found', 'Matière introuvable.', 'SUBJECT_NOT_FOUND');
    if (!staffSnap.exists) throw failure('not-found', 'Enseignant introuvable.', 'TEACHER_NOT_FOUND');
    const year = yearSnap.data() as Data;
    const klass = classSnap.data() as Data;
    const subject = subjectSnap.data() as Data;
    const staff = staffSnap.data() as Data;
    if ([year.schoolId, klass.schoolId, subject.schoolId, staff.schoolId].some(value => value !== schoolId)) {
      throw failure('permission-denied', 'Une entité appartient à une autre école.', 'SCHOOL_MISMATCH');
    }

    if (action === 'DEACTIVATE') {
      if (existing?.status === 'inactive') return { success: true, changed: false, assignment: existing };
      if (existing?.status !== 'active') throw failure('failed-precondition', 'Seule une affectation active peut être désactivée.', 'INVALID_STATUS');
      const slotRef = db.collection('teacherAssignmentSlots').doc(requestedRef.id);
      const slotSnap = await transaction.get(slotRef);
      if (!slotSnap.exists || slotSnap.data()?.isActive !== true) {
        throw failure('failed-precondition', 'Index d’autorisation incohérent.', 'ASSIGNMENT_INTEGRITY_ERROR');
      }
      const version = Number(existing.version || 0) + 1;
      transaction.update(requestedRef, {
        status: 'inactive', isActive: false, endedAt: FieldValue.serverTimestamp(), deactivatedAt: FieldValue.serverTimestamp(),
        deactivatedBy: uid, deactivationReason: reason, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid, version,
      });
      transaction.update(slotRef, { status: 'inactive', isActive: false, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid });
      transaction.set(db.collection('audit_logs').doc(), {
        schoolId, action: 'TEACHER_ASSIGNMENT_DEACTIVATED', actorUid: uid, actorRole: role,
        targetType: 'teacherAssignment', targetId: requestedRef.id,
        details: { academicYearId: effectiveYearId, classId: effectiveClassId, subjectId: effectiveSubjectId, teacherStaffId: effectiveStaffId },
        timestamp: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(), canonicalBackendAudit: true,
        ...(existing.testFixture === true ? { testFixture: true, testRunId: existing.testRunId } : {}),
      });
      return { success: true, changed: true, assignment: { ...existing, status: 'inactive', isActive: false, version, updatedAt: nowIso, updatedBy: uid } };
    }

    const yearStatus = String(year.status || '').toLowerCase();
    const usableYearStatuses = new Set(['active', 'actif', 'utilisable']);
    const draftYearStatuses = new Set([...usableYearStatuses, 'draft', 'brouillon']);
    const yearAllowed = action === 'ACTIVATE'
      ? usableYearStatuses.has(yearStatus)
      : draftYearStatuses.has(yearStatus);
    if (!yearAllowed || year.isActive === false || year.active === false) {
      throw failure('failed-precondition', 'Année scolaire inactive.', 'ACADEMIC_YEAR_INACTIVE');
    }
    if (!active(klass)) throw failure('failed-precondition', 'Classe inactive.', 'CLASS_INACTIVE');
    if (!active(subject)) throw failure('failed-precondition', 'Matière inactive.', 'SUBJECT_INACTIVE');
    const staffType = String(staff.staffType || staff.role || '');
    if (staffType !== 'teacher' && staff.teachingEnabled !== true) {
      throw failure('failed-precondition', 'Personnel non habilité à enseigner.', 'TEACHER_NOT_ELIGIBLE');
    }
    if (!active(staff)) throw failure('failed-precondition', 'Enseignant inactif.', 'TEACHER_INACTIVE');

    if (action === 'UPDATE_DRAFT') {
      if (existing?.status !== 'draft') throw failure('failed-precondition', 'Seul un brouillon peut être modifié.', 'INVALID_STATUS');
      const version = Number(existing.version || 0) + 1;
      transaction.update(requestedRef, { note, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid, version });
      transaction.set(db.collection('audit_logs').doc(), {
        schoolId, action: 'TEACHER_ASSIGNMENT_UPDATED', actorUid: uid, actorRole: role,
        targetType: 'teacherAssignment', targetId: requestedRef.id,
        details: { academicYearId: effectiveYearId, classId: effectiveClassId, subjectId: effectiveSubjectId, teacherStaffId: effectiveStaffId },
        timestamp: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(), canonicalBackendAudit: true,
        ...(existing.testFixture === true ? { testFixture: true, testRunId: existing.testRunId } : {}),
      });
      return { success: true, changed: true, assignment: { ...existing, note, version, updatedAt: nowIso, updatedBy: uid } };
    }

    if (action === 'CREATE_DRAFT') {
      const canonical = {
        id: requestedRef.id, assignmentId: requestedRef.id, schoolId, academicYearId: effectiveYearId,
        classId: effectiveClassId, subjectId: effectiveSubjectId, teacherStaffId: effectiveStaffId,
        status: 'draft', isActive: false, version: 1, note,
        createdAt: nowIso, createdBy: uid, updatedAt: nowIso, updatedBy: uid, ...fixture,
      };
      transaction.create(requestedRef, { ...canonical, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      transaction.set(db.collection('audit_logs').doc(), {
        schoolId, action: 'TEACHER_ASSIGNMENT_CREATED', actorUid: uid, actorRole: role,
        targetType: 'teacherAssignment', targetId: requestedRef.id,
        details: { academicYearId: effectiveYearId, classId: effectiveClassId, subjectId: effectiveSubjectId, teacherStaffId: effectiveStaffId, status: 'draft' },
        timestamp: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(), canonicalBackendAudit: true, ...fixture,
      });
      return { success: true, changed: true, assignment: canonical };
    }

    if (existing?.status === 'active') return { success: true, changed: false, assignment: existing };
    if (existing?.status !== 'draft') throw failure('failed-precondition', 'Seul un brouillon peut être activé.', 'INVALID_STATUS');
    const published = programsSnap.docs.filter(doc => doc.data().status === 'published' && doc.data().publishedRevisionId);
    if (published.length === 0) throw failure('failed-precondition', 'Programme non publié : activation impossible.', 'PROGRAM_NOT_PUBLISHED');
    if (published.length !== 1) throw failure('failed-precondition', 'Programmes publiés incohérents.', 'PROGRAM_INTEGRITY_ERROR');
    const program = published[0];
    const revisionId = id(program.data().publishedRevisionId, 'publishedRevisionId');
    const programSubjectsSnap = await transaction.get(db.collection('classSubjects')
      .where('programId', '==', program.id).where('revisionId', '==', revisionId));
    const matches = programSubjectsSnap.docs.filter(doc => {
      const row = doc.data();
      return (row.subjectId === effectiveSubjectId || row.catalogSubjectId === effectiveSubjectId) && row.isActive !== false;
    });
    if (matches.length === 0) throw failure('failed-precondition', 'Matière absente du programme publié.', 'SUBJECT_NOT_IN_PUBLISHED_PROGRAM');
    if (matches.length !== 1) throw failure('failed-precondition', 'Matière publiée ambiguë.', 'PROGRAM_INTEGRITY_ERROR');
    if (!linkByStaffSnap.exists || linkByStaffSnap.data()?.isActive !== true) {
      throw failure('failed-precondition', 'Liaison Staff/User active requise.', 'TEACHER_LINK_REQUIRED');
    }
    const linkByStaff = linkByStaffSnap.data() as Data;
    const userId = id(linkByStaff.userId, 'teacherUserId');
    const linkId = id(linkByStaff.linkId, 'linkId');
    const [linkByUserSnap, linkSnap, teacherUserSnap] = await Promise.all([
      transaction.get(db.collection('staffUserLinkByUser').doc(userId)),
      transaction.get(db.collection('staffUserLinks').doc(linkId)),
      transaction.get(db.collection('users').doc(userId)),
    ]);
    const linkByUser = linkByUserSnap.data() as Data | undefined;
    const link = linkSnap.data() as Data | undefined;
    const teacherUser = teacherUserSnap.data() as Data | undefined;
    if (!linkByUserSnap.exists || !linkSnap.exists || !teacherUserSnap.exists || !linkByUser || !link || !teacherUser
        || linkByUser.isActive !== true || link.isActive !== true || !active(teacherUser)
        || linkByUser.schoolId !== schoolId || link.schoolId !== schoolId
        || linkByUser.staffId !== effectiveStaffId || link.staffId !== effectiveStaffId
        || linkByUser.userId !== userId || link.userId !== userId
        || linkByUser.linkId !== linkId || teacherUser.schoolId !== schoolId || teacherUser.role !== 'teacher') {
      throw failure('failed-precondition', 'Liaison Staff/User incohérente.', 'TEACHER_LINK_INTEGRITY_ERROR');
    }
    const classSubject = matches[0];
    const version = Number(existing.version || 0) + 1;
    const activation = {
      status: 'active', isActive: true, teacherUserId: userId,
      sourceProgramId: program.id, sourcePublishedRevisionId: revisionId, sourceClassSubjectId: classSubject.id,
      startedAt: FieldValue.serverTimestamp(), endedAt: null, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid, version,
    };
    transaction.update(requestedRef, activation);
    transaction.set(db.collection('teacherAssignmentSlots').doc(requestedRef.id), {
      id: requestedRef.id, assignmentId: requestedRef.id, schoolId, academicYearId: effectiveYearId,
      classId: effectiveClassId, subjectId: effectiveSubjectId, teacherStaffId: effectiveStaffId,
      teacherUserId: userId, status: 'active', isActive: true,
      sourceProgramId: program.id, sourcePublishedRevisionId: revisionId, sourceClassSubjectId: classSubject.id,
      updatedAt: FieldValue.serverTimestamp(), updatedBy: uid,
      ...(existing.testFixture === true ? { testFixture: true, testRunId: existing.testRunId } : {}),
    });
    transaction.set(db.collection('audit_logs').doc(), {
      schoolId, action: 'TEACHER_ASSIGNMENT_ACTIVATED', actorUid: uid, actorRole: role,
      targetType: 'teacherAssignment', targetId: requestedRef.id,
      details: { academicYearId: effectiveYearId, classId: effectiveClassId, subjectId: effectiveSubjectId, teacherStaffId: effectiveStaffId },
      timestamp: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(), canonicalBackendAudit: true,
      ...(existing.testFixture === true ? { testFixture: true, testRunId: existing.testRunId } : {}),
    });
    return { success: true, changed: true, assignment: { ...existing, ...activation, startedAt: nowIso, updatedAt: nowIso } };
  });
});
