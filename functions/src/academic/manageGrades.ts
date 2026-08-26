import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import * as crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';

type Data = Record<string, unknown>;
type EvaluationAction = 'CREATE_DRAFT' | 'UPDATE_DRAFT' | 'OPEN' | 'LOCK' | 'PUBLISH' | 'CANCEL';
type ResultStatus = 'scored' | 'absent' | 'excused' | 'notSubmitted';

const MANAGER_ROLES = new Set(['superAdmin', 'owner', 'director']);
const EVALUATION_MUTATION_ROLES = new Set([...MANAGER_ROLES, 'teacher']);
const RESULT_STATUSES = new Set<ResultStatus>(['scored', 'absent', 'excused', 'notSubmitted']);
const PROFILE_FIELDS = new Set(['title', 'type', 'date', 'maxScore', 'weight', 'testFixture', 'testRunId']);
const MAX_BATCH_SIZE = 200;

const failure = (code: functions.https.FunctionsErrorCode, message: string, businessCode: string) =>
  new functions.https.HttpsError(code, message, { businessCode });

const object = (value: unknown, field: string): Data => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw failure('invalid-argument', `${field} doit être un objet.`, 'INVALID_ARGUMENT');
  }
  return value as Data;
};

const cleanId = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_%.-]{1,512}$/.test(value.trim())) {
    throw failure('invalid-argument', `${field} est invalide.`, 'INVALID_ARGUMENT');
  }
  return value.trim();
};

const cleanShortId = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value.trim())) {
    throw failure('invalid-argument', `${field} est invalide.`, 'INVALID_ARGUMENT');
  }
  return value.trim();
};

const dateOnly = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw failure('invalid-argument', `${field} doit être au format YYYY-MM-DD.`, 'INVALID_DATE');
  }
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw failure('invalid-argument', `${field} est invalide.`, 'INVALID_DATE');
  }
  return value;
};

const active = (data: Data): boolean => data.active === true || data.isActive === true || data.status === 'active';

const finitePositive = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 10000) {
    throw failure('invalid-argument', `${field} doit être un nombre fini strictement positif.`, 'INVALID_SCORE_SCALE');
  }
  return value;
};

const parseProfile = (raw: unknown): Data => {
  const input = object(raw, 'profile');
  const unsupported = Object.keys(input).filter(key => !PROFILE_FIELDS.has(key));
  if (unsupported.length) throw failure('invalid-argument', `Champs non autorisés: ${unsupported.join(', ')}.`, 'UNSUPPORTED_FIELDS');
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.trim().length > 160) {
    throw failure('invalid-argument', 'Le titre est requis.', 'INVALID_TITLE');
  }
  if (typeof input.type !== 'string' || !input.type.trim() || input.type.trim().length > 64) {
    throw failure('invalid-argument', 'Le type est requis.', 'INVALID_TYPE');
  }
  const fixture = input.testFixture === true || input.testRunId !== undefined
    ? { testFixture: true, testRunId: cleanShortId(input.testRunId, 'testRunId') }
    : {};
  if (input.testFixture !== undefined && input.testFixture !== true) {
    throw failure('invalid-argument', 'testFixture doit valoir true.', 'INVALID_FIXTURE');
  }
  return {
    title: input.title.trim(), type: input.type.trim(), date: dateOnly(input.date, 'date'),
    maxScore: finitePositive(input.maxScore, 'maxScore'), weight: finitePositive(input.weight, 'weight'), ...fixture,
  };
};

const canonicalGradeId = (evaluationId: string, studentId: string): string =>
  `gr_${crypto.createHash('sha256').update(`${evaluationId}\u0000${studentId}`).digest('base64url')}`;

const requestHash = (evaluationId: string, rows: Data[]): string => crypto.createHash('sha256')
  .update(JSON.stringify({ evaluationId, rows: [...rows].sort((a, b) => String(a.studentId).localeCompare(String(b.studentId))) }))
  .digest('hex');

const actorContext = async (uid: string, requestedSchoolId: unknown) => {
  const db = admin.firestore();
  const actorSnap = await db.collection('users').doc(uid).get();
  const actor = actorSnap.data() as Data | undefined;
  if (!actorSnap.exists || !actor || !active(actor)) throw failure('permission-denied', 'Compte actif requis.', 'PERMISSION_DENIED');
  const role = typeof actor.role === 'string' ? actor.role : '';
  const actorSchoolId = typeof actor.schoolId === 'string' ? actor.schoolId.trim() : '';
  const explicitSchoolId = requestedSchoolId === undefined ? '' : cleanShortId(requestedSchoolId, 'schoolId');
  const schoolId = role === 'superAdmin' ? explicitSchoolId : actorSchoolId;
  if (!schoolId || (role !== 'superAdmin' && explicitSchoolId && explicitSchoolId !== schoolId)) {
    throw failure('permission-denied', 'Accès inter-école refusé.', 'SCHOOL_MISMATCH');
  }
  return { db, actor, role, schoolId };
};

const validateProductionFixture = (actor: Data, fixtureSource: Data) => {
  if (process.env.GCLOUD_PROJECT === 'ecoscolaire-c5861' && fixtureSource.testFixture === true
      && (actor.testFixture !== true || actor.testRunId !== fixtureSource.testRunId)) {
    throw failure('permission-denied', 'Fixture Production non autorisée.', 'FIXTURE_FORBIDDEN');
  }
};

const assertEvaluationDependencies = async (
  transaction: admin.firestore.Transaction,
  db: admin.firestore.Firestore,
  params: { schoolId: string; academicYearId: string; periodId: string; classId: string; subjectId: string; teacherAssignmentId: string; uid: string; role: string }
) => {
  const { schoolId, academicYearId, periodId, classId, subjectId, teacherAssignmentId, uid, role } = params;
  const [yearSnap, periodSnap, classSnap, subjectSnap, assignmentSnap] = await Promise.all([
    transaction.get(db.collection('academicYears').doc(academicYearId)),
    transaction.get(db.collection('periods').doc(periodId)),
    transaction.get(db.collection('classes').doc(classId)),
    transaction.get(db.collection('subjects').doc(subjectId)),
    transaction.get(db.collection('teacherAssignments').doc(teacherAssignmentId)),
  ]);
  const docs = [yearSnap, periodSnap, classSnap, subjectSnap, assignmentSnap];
  if (docs.some(doc => !doc.exists)) throw failure('not-found', 'Configuration pédagogique introuvable.', 'PEDAGOGICAL_CONFIGURATION_MISSING');
  const year = yearSnap.data() as Data;
  const period = periodSnap.data() as Data;
  const klass = classSnap.data() as Data;
  const subject = subjectSnap.data() as Data;
  const assignment = assignmentSnap.data() as Data;
  if ([year, period, klass, subject, assignment].some(doc => doc.schoolId !== schoolId)) {
    throw failure('permission-denied', 'Accès inter-école refusé.', 'SCHOOL_MISMATCH');
  }
  if (year.status !== 'active') throw failure('failed-precondition', 'Année scolaire inactive.', 'YEAR_NOT_ACTIVE');
  if (period.academicYearId !== academicYearId || period.status !== 'open') {
    throw failure('failed-precondition', 'Une période OPEN est requise.', 'PERIOD_NOT_OPEN');
  }
  if (!active(klass)) throw failure('failed-precondition', 'Classe inactive.', 'CLASS_INACTIVE');
  if (subject.isActive === false || subject.status === 'inactive') throw failure('failed-precondition', 'Matière inactive.', 'SUBJECT_INACTIVE');
  if (assignment.academicYearId !== academicYearId || assignment.classId !== classId || assignment.subjectId !== subjectId
      || assignment.status !== 'active' || assignment.isActive !== true) {
    throw failure('failed-precondition', 'Affectation ACTIVE correspondante requise.', 'TEACHER_ASSIGNMENT_NOT_ACTIVE');
  }
  if (role === 'teacher' && assignment.teacherUserId !== uid) {
    throw failure('permission-denied', 'Cette affectation ne vous appartient pas.', 'ASSIGNMENT_OWNERSHIP_REQUIRED');
  }
  const programId = cleanId(assignment.sourceProgramId, 'sourceProgramId');
  const revisionId = cleanId(assignment.sourcePublishedRevisionId, 'sourcePublishedRevisionId');
  const classSubjectId = cleanId(assignment.sourceClassSubjectId, 'sourceClassSubjectId');
  const teacherStaffId = cleanShortId(assignment.teacherStaffId, 'teacherStaffId');
  const teacherUserId = cleanShortId(assignment.teacherUserId, 'teacherUserId');
  const [programSnap, classSubjectSnap, staffSnap, linkByUserSnap] = await Promise.all([
    transaction.get(db.collection('classPrograms').doc(programId)),
    transaction.get(db.collection('classSubjects').doc(classSubjectId)),
    transaction.get(db.collection('staff').doc(teacherStaffId)),
    transaction.get(db.collection('staffUserLinkByUser').doc(teacherUserId)),
  ]);
  const program = programSnap.data() as Data | undefined;
  const classSubject = classSubjectSnap.data() as Data | undefined;
  const staff = staffSnap.data() as Data | undefined;
  const linkByUser = linkByUserSnap.data() as Data | undefined;
  if (!programSnap.exists || !program || program.schoolId !== schoolId || program.classId !== classId
      || program.status !== 'published' || program.publishedRevisionId !== revisionId) {
    throw failure('failed-precondition', 'Programme publié requis.', 'PROGRAM_NOT_PUBLISHED');
  }
  if (!classSubjectSnap.exists || !classSubject || classSubject.programId !== programId || classSubject.revisionId !== revisionId
      || classSubject.isActive === false || (classSubject.subjectId !== subjectId && classSubject.catalogSubjectId !== subjectId)) {
    throw failure('failed-precondition', 'Matière absente du programme publié.', 'SUBJECT_NOT_IN_PUBLISHED_PROGRAM');
  }
  if (!staffSnap.exists || !staff || staff.schoolId !== schoolId || !active(staff)
      || !linkByUserSnap.exists || !linkByUser || linkByUser.schoolId !== schoolId
      || linkByUser.staffId !== teacherStaffId || linkByUser.userId !== teacherUserId || linkByUser.isActive !== true) {
    throw failure('failed-precondition', 'Lien Staff/User canonique actif requis.', 'TEACHER_LINK_REQUIRED');
  }
  return { assignment, classSubjectId, programId, revisionId };
};

export const manageEvaluation = functions.https.onCall(async (raw, context) => {
  if (!context.auth?.uid) throw failure('unauthenticated', 'Authentification requise.', 'UNAUTHENTICATED');
  const payload = object(raw, 'payload');
  const allowed = new Set(['action', 'evaluationId', 'schoolId', 'academicYearId', 'periodId', 'classId', 'subjectId', 'teacherAssignmentId', 'profile', 'expectedVersion']);
  if (Object.keys(payload).some(key => !allowed.has(key))) throw failure('invalid-argument', 'Payload non autorisé.', 'INVALID_ARGUMENT');
  const action = String(payload.action) as EvaluationAction;
  if (!['CREATE_DRAFT', 'UPDATE_DRAFT', 'OPEN', 'LOCK', 'PUBLISH', 'CANCEL'].includes(action)) {
    throw failure('invalid-argument', 'Action invalide.', 'INVALID_ACTION');
  }
  const uid = context.auth.uid;
  const { db, actor, role, schoolId } = await actorContext(uid, payload.schoolId);
  if (!EVALUATION_MUTATION_ROLES.has(role)) throw failure('permission-denied', 'Rôle non autorisé.', 'PERMISSION_DENIED');
  const evaluationId = cleanId(payload.evaluationId, 'evaluationId');
  const evaluationRef = db.collection('evaluations').doc(evaluationId);
  const profile = action === 'CREATE_DRAFT' || action === 'UPDATE_DRAFT' ? parseProfile(payload.profile) : {};
  validateProductionFixture(actor, profile);
  const nowIso = new Date().toISOString();

  return db.runTransaction(async transaction => {
    const evaluationSnap = await transaction.get(evaluationRef);
    const existing = evaluationSnap.data() as Data | undefined;
    if (action === 'CREATE_DRAFT' && evaluationSnap.exists) {
      const sameRequest = existing?.createdBy === uid
        && existing.academicYearId === payload.academicYearId && existing.periodId === payload.periodId
        && existing.classId === payload.classId && existing.subjectId === payload.subjectId
        && existing.teacherAssignmentId === payload.teacherAssignmentId
        && existing.title === profile.title && existing.type === profile.type && existing.date === profile.date
        && existing.maxScore === profile.maxScore && existing.weight === profile.weight;
      if (sameRequest) return { success: true, changed: false, evaluation: existing };
      throw failure('already-exists', 'evaluationId déjà utilisé avec un autre contenu.', 'IDEMPOTENCY_CONFLICT');
    }
    if (action !== 'CREATE_DRAFT' && (!evaluationSnap.exists || !existing)) throw failure('not-found', 'Évaluation introuvable.', 'EVALUATION_NOT_FOUND');
    if (existing && existing.schoolId !== schoolId) throw failure('permission-denied', 'Accès inter-école refusé.', 'SCHOOL_MISMATCH');
    const expectedVersion = payload.expectedVersion === undefined ? undefined : Number(payload.expectedVersion);
    if (existing && (!Number.isInteger(expectedVersion) || expectedVersion !== Number(existing.version))) {
      throw failure('failed-precondition', 'Version obsolète.', 'VERSION_CONFLICT');
    }

    if (action === 'CREATE_DRAFT') {
      const academicYearId = cleanShortId(payload.academicYearId, 'academicYearId');
      const periodId = cleanShortId(payload.periodId, 'periodId');
      const classId = cleanShortId(payload.classId, 'classId');
      const subjectId = cleanShortId(payload.subjectId, 'subjectId');
      const teacherAssignmentId = cleanId(payload.teacherAssignmentId, 'teacherAssignmentId');
      const deps = await assertEvaluationDependencies(transaction, db, { schoolId, academicYearId, periodId, classId, subjectId, teacherAssignmentId, uid, role });
      if (String(profile.date) < String((await transaction.get(db.collection('periods').doc(periodId))).data()?.startDate)
          || String(profile.date) > String((await transaction.get(db.collection('periods').doc(periodId))).data()?.endDate)) {
        throw failure('failed-precondition', 'Date hors période.', 'DATE_OUTSIDE_PERIOD');
      }
      const canonical = {
        id: evaluationId, schoolId, academicYearId, periodId, classId, subjectId,
        classSubjectId: deps.classSubjectId, teacherAssignmentId,
        teacherStaffId: deps.assignment.teacherStaffId, teacherUserId: deps.assignment.teacherUserId,
        sourceProgramId: deps.programId, sourcePublishedRevisionId: deps.revisionId,
        ...profile, status: 'draft', version: 1,
        createdAt: nowIso, createdBy: uid, updatedAt: nowIso, updatedBy: uid,
      };
      transaction.create(evaluationRef, { ...canonical, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      transaction.set(db.collection('audit_logs').doc(), {
        schoolId, action: 'EVALUATION_CREATED', actorUid: uid, actorRole: role,
        targetType: 'evaluation', targetId: evaluationId,
        details: { academicYearId, periodId, classId, subjectId, teacherAssignmentId, status: 'draft' },
        timestamp: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(), canonicalBackendAudit: true,
        ...(profile.testFixture === true ? { testFixture: true, testRunId: profile.testRunId } : {}),
      });
      return { success: true, changed: true, evaluation: canonical };
    }

    validateProductionFixture(actor, existing as Data);
    if (role === 'teacher' && existing?.teacherUserId !== uid) throw failure('permission-denied', 'Évaluation non autorisée.', 'EVALUATION_OWNERSHIP_REQUIRED');
    const version = Number(existing?.version || 0) + 1;
    let nextStatus = String(existing?.status);
    let updates: Data = {};
    let auditAction = '';
    if (action === 'UPDATE_DRAFT') {
      if (existing?.status !== 'draft') throw failure('failed-precondition', 'Seul un brouillon peut être modifié.', 'INVALID_STATUS');
      await assertEvaluationDependencies(transaction, db, {
        schoolId, academicYearId: String(existing.academicYearId), periodId: String(existing.periodId), classId: String(existing.classId),
        subjectId: String(existing.subjectId), teacherAssignmentId: String(existing.teacherAssignmentId), uid, role,
      });
      const period = (await transaction.get(db.collection('periods').doc(String(existing.periodId)))).data() as Data;
      if (String(profile.date) < String(period.startDate) || String(profile.date) > String(period.endDate)) {
        throw failure('failed-precondition', 'Date hors période.', 'DATE_OUTSIDE_PERIOD');
      }
      updates = profile;
      auditAction = 'EVALUATION_UPDATED';
    } else if (action === 'OPEN') {
      if (existing?.status !== 'draft') throw failure('failed-precondition', 'Transition DRAFT → OPEN requise.', 'INVALID_STATUS');
      await assertEvaluationDependencies(transaction, db, {
        schoolId, academicYearId: String(existing.academicYearId), periodId: String(existing.periodId), classId: String(existing.classId),
        subjectId: String(existing.subjectId), teacherAssignmentId: String(existing.teacherAssignmentId), uid, role,
      });
      nextStatus = 'open'; updates = { status: nextStatus }; auditAction = 'EVALUATION_OPENED';
    } else if (action === 'LOCK') {
      if (existing?.status !== 'open') throw failure('failed-precondition', 'Transition OPEN → LOCKED requise.', 'INVALID_STATUS');
      nextStatus = 'locked'; updates = { status: nextStatus, lockedAt: FieldValue.serverTimestamp(), lockedBy: uid }; auditAction = 'EVALUATION_LOCKED';
    } else if (action === 'PUBLISH') {
      if (!MANAGER_ROLES.has(role)) throw failure('permission-denied', 'Publication réservée à la direction.', 'PERMISSION_DENIED');
      if (existing?.status !== 'locked') throw failure('failed-precondition', 'Transition LOCKED → PUBLISHED requise.', 'INVALID_STATUS');
      nextStatus = 'published'; updates = { status: nextStatus, publishedAt: FieldValue.serverTimestamp(), publishedBy: uid }; auditAction = 'EVALUATION_PUBLISHED';
    } else {
      if (existing?.status === 'published' || existing?.status === 'cancelled') throw failure('failed-precondition', 'Évaluation non annulable.', 'INVALID_STATUS');
      nextStatus = 'cancelled'; updates = { status: nextStatus, cancelledAt: FieldValue.serverTimestamp(), cancelledBy: uid }; auditAction = 'EVALUATION_CANCELLED';
    }
    transaction.update(evaluationRef, { ...updates, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid, version });
    transaction.set(db.collection('audit_logs').doc(), {
      schoolId, action: auditAction, actorUid: uid, actorRole: role, targetType: 'evaluation', targetId: evaluationId,
      details: { previousStatus: existing?.status, newStatus: nextStatus, academicYearId: existing?.academicYearId, periodId: existing?.periodId, classId: existing?.classId, subjectId: existing?.subjectId },
      timestamp: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(), canonicalBackendAudit: true,
      ...(existing?.testFixture === true ? { testFixture: true, testRunId: existing.testRunId } : {}),
    });
    return { success: true, changed: true, evaluation: { ...existing, ...profile, ...updates, updatedAt: nowIso, updatedBy: uid, version } };
  });
});

const parseGradeRows = (raw: unknown, maxScore: number): Data[] => {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_BATCH_SIZE) {
    throw failure('invalid-argument', `Le lot doit contenir entre 1 et ${MAX_BATCH_SIZE} lignes.`, 'INVALID_BATCH_SIZE');
  }
  const students = new Set<string>();
  return raw.map((value, index) => {
    const row = object(value, `rows[${index}]`);
    if (Object.keys(row).some(key => !['studentId', 'resultStatus', 'score', 'comment', 'expectedVersion'].includes(key))) {
      throw failure('invalid-argument', `Ligne ${index + 1} non autorisée.`, 'UNSUPPORTED_FIELDS');
    }
    const studentId = cleanShortId(row.studentId, `rows[${index}].studentId`);
    if (students.has(studentId)) throw failure('invalid-argument', 'Élève dupliqué dans le lot.', 'DUPLICATE_STUDENT');
    students.add(studentId);
    if (typeof row.resultStatus !== 'string' || !RESULT_STATUSES.has(row.resultStatus as ResultStatus)) {
      throw failure('invalid-argument', 'Statut de résultat invalide.', 'INVALID_RESULT_STATUS');
    }
    const resultStatus = row.resultStatus as ResultStatus;
    let score: number | undefined;
    if (resultStatus === 'scored') {
      if (typeof row.score !== 'number' || !Number.isFinite(row.score) || row.score < 0 || row.score > maxScore) {
        throw failure('invalid-argument', 'Score hors barème.', 'INVALID_SCORE');
      }
      score = row.score;
    } else if (row.score !== undefined) {
      throw failure('invalid-argument', 'Une absence ou dispense ne doit pas contenir de score.', 'SCORE_STATUS_CONFLICT');
    }
    if (row.comment !== undefined && (typeof row.comment !== 'string' || row.comment.length > 500)) {
      throw failure('invalid-argument', 'Commentaire invalide.', 'INVALID_COMMENT');
    }
    const expectedVersion = row.expectedVersion === undefined ? 0 : Number(row.expectedVersion);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0) throw failure('invalid-argument', 'Version invalide.', 'INVALID_VERSION');
    return { studentId, resultStatus, ...(score !== undefined ? { score } : {}), ...(row.comment ? { comment: row.comment.trim() } : {}), expectedVersion };
  });
};

export const recordGradesBatch = functions.https.onCall(async (raw, context) => {
  if (!context.auth?.uid) throw failure('unauthenticated', 'Authentification requise.', 'UNAUTHENTICATED');
  const payload = object(raw, 'payload');
  if (Object.keys(payload).some(key => !['schoolId', 'evaluationId', 'requestId', 'rows'].includes(key))) {
    throw failure('invalid-argument', 'Payload non autorisé.', 'INVALID_ARGUMENT');
  }
  const uid = context.auth.uid;
  const { db, actor, role, schoolId } = await actorContext(uid, payload.schoolId);
  if (!EVALUATION_MUTATION_ROLES.has(role)) throw failure('permission-denied', 'Rôle non autorisé.', 'PERMISSION_DENIED');
  const evaluationId = cleanId(payload.evaluationId, 'evaluationId');
  const requestId = cleanShortId(payload.requestId, 'requestId');
  const evaluationRef = db.collection('evaluations').doc(evaluationId);
  const initialEvaluation = (await evaluationRef.get()).data() as Data | undefined;
  if (!initialEvaluation || initialEvaluation.schoolId !== schoolId) throw failure('not-found', 'Évaluation introuvable.', 'EVALUATION_NOT_FOUND');
  if (initialEvaluation.status !== 'open') throw failure('failed-precondition', 'La saisie requiert une évaluation OPEN.', 'EVALUATION_NOT_OPEN');
  if (role === 'teacher' && initialEvaluation.teacherUserId !== uid) throw failure('permission-denied', 'Évaluation non autorisée.', 'EVALUATION_OWNERSHIP_REQUIRED');
  validateProductionFixture(actor, initialEvaluation);
  const maxScore = finitePositive(initialEvaluation.maxScore, 'maxScore');
  const rows = parseGradeRows(payload.rows, maxScore);
  const payloadHash = requestHash(evaluationId, rows);
  const requestRef = db.collection('gradeBatchRequests').doc(`${schoolId}_${requestId}`);
  const nowIso = new Date().toISOString();

  return db.runTransaction(async transaction => {
    const [evaluationSnap, requestSnap] = await Promise.all([transaction.get(evaluationRef), transaction.get(requestRef)]);
    const evaluation = evaluationSnap.data() as Data | undefined;
    if (!evaluation || evaluation.schoolId !== schoolId) throw failure('not-found', 'Évaluation introuvable.', 'EVALUATION_NOT_FOUND');
    if (evaluation.status !== 'open') throw failure('failed-precondition', 'Évaluation verrouillée.', 'EVALUATION_NOT_OPEN');
    if (role === 'teacher' && evaluation.teacherUserId !== uid) throw failure('permission-denied', 'Évaluation non autorisée.', 'EVALUATION_OWNERSHIP_REQUIRED');
    if (requestSnap.exists) {
      const previous = requestSnap.data() as Data;
      if (previous.payloadHash !== payloadHash || previous.evaluationId !== evaluationId || previous.actorUid !== uid) {
        throw failure('already-exists', 'requestId déjà utilisé avec un autre contenu.', 'IDEMPOTENCY_CONFLICT');
      }
      return { success: true, changed: false, idempotent: true, count: previous.count };
    }
    const deps = await assertEvaluationDependencies(transaction, db, {
      schoolId, academicYearId: String(evaluation.academicYearId), periodId: String(evaluation.periodId), classId: String(evaluation.classId),
      subjectId: String(evaluation.subjectId), teacherAssignmentId: String(evaluation.teacherAssignmentId), uid, role,
    });
    if (deps.classSubjectId !== evaluation.classSubjectId) throw failure('failed-precondition', 'Révision du programme incohérente.', 'PROGRAM_INTEGRITY_ERROR');

    const studentRefs = rows.map(row => db.collection('students').doc(String(row.studentId)));
    const gradeRefs = rows.map(row => db.collection('grades').doc(canonicalGradeId(evaluationId, String(row.studentId))));
    const studentSnaps = await Promise.all(studentRefs.map(ref => transaction.get(ref)));
    const gradeSnaps = await Promise.all(gradeRefs.map(ref => transaction.get(ref)));
    for (let index = 0; index < rows.length; index += 1) {
      const student = studentSnaps[index].data() as Data | undefined;
      if (!student || student.schoolId !== schoolId || student.classId !== evaluation.classId || !active(student)
          || student.academicYearId !== evaluation.academicYearId) {
        throw failure('failed-precondition', 'Élève non éligible pour cette évaluation.', 'STUDENT_NOT_ELIGIBLE');
      }
      const existing = gradeSnaps[index].data() as Data | undefined;
      if (existing && (existing.schoolId !== schoolId || existing.evaluationId !== evaluationId || existing.studentId !== rows[index].studentId)) {
        throw failure('failed-precondition', 'Collision de note canonique.', 'GRADE_INTEGRITY_ERROR');
      }
      if (Number(rows[index].expectedVersion) !== Number(existing?.version || 0)) {
        throw failure('failed-precondition', 'Version de note obsolète.', 'VERSION_CONFLICT');
      }
    }

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const existing = gradeSnaps[index].data() as Data | undefined;
      const version = Number(existing?.version || 0) + 1;
      const canonical = {
        id: gradeRefs[index].id, schoolId, academicYearId: evaluation.academicYearId, periodId: evaluation.periodId,
        evaluationId, classId: evaluation.classId, classSubjectId: evaluation.classSubjectId, subjectId: evaluation.subjectId,
        studentId: row.studentId, teacherAssignmentId: evaluation.teacherAssignmentId,
        teacherStaffId: evaluation.teacherStaffId, teacherUserId: evaluation.teacherUserId,
        teacherId: evaluation.teacherStaffId,
        resultStatus: row.resultStatus, ...(row.score !== undefined ? { score: row.score } : {}),
        ...(row.comment ? { comment: row.comment } : {}), maxScore, status: 'draft', version,
        createdAt: existing?.createdAt || nowIso, createdBy: existing?.createdBy || uid, updatedAt: nowIso, updatedBy: uid,
        ...(evaluation.testFixture === true ? { testFixture: true, testRunId: evaluation.testRunId } : {}),
      };
      transaction.set(gradeRefs[index], { ...canonical, createdAt: existing?.createdAt || FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      transaction.set(db.collection('audit_logs').doc(), {
        schoolId, action: existing ? 'GRADE_CORRECTED' : 'GRADE_RECORDED', actorUid: uid, actorRole: role,
        targetType: 'grade', targetId: gradeRefs[index].id,
        details: { evaluationId, studentId: row.studentId, previousResultStatus: existing?.resultStatus ?? null,
          previousScore: existing?.score ?? null, newResultStatus: row.resultStatus, newScore: row.score ?? null, previousVersion: existing?.version ?? 0, newVersion: version },
        timestamp: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(), canonicalBackendAudit: true,
        ...(evaluation.testFixture === true ? { testFixture: true, testRunId: evaluation.testRunId } : {}),
      });
    }
    transaction.create(requestRef, {
      id: requestRef.id, schoolId, evaluationId, actorUid: uid, payloadHash, count: rows.length,
      createdAt: FieldValue.serverTimestamp(), expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      ...(evaluation.testFixture === true ? { testFixture: true, testRunId: evaluation.testRunId } : {}),
    });
    return { success: true, changed: true, idempotent: false, count: rows.length };
  });
});

export const gradingTestContracts = { canonicalGradeId, parseGradeRows, requestHash };
