import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import * as functions from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';
import {
  calculateCanonicalGeneral,
  calculateCanonicalSubject,
  normalizeCanonicalGrade,
  type CanonicalEvaluationScore,
} from './canonicalGradeCalculations';

type Data = Record<string, unknown>;
type ReportCardAction = 'GENERATE_DRAFT' | 'REFRESH_DRAFT' | 'VALIDATE' | 'PUBLISH';

const MANAGER_ROLES = new Set(['superAdmin', 'owner', 'director']);
const ACTIONS = new Set<ReportCardAction>(['GENERATE_DRAFT', 'REFRESH_DRAFT', 'VALIDATE', 'PUBLISH']);
const failure = (code: functions.https.FunctionsErrorCode, message: string, businessCode: string) =>
  new functions.https.HttpsError(code, message, { businessCode });

const object = (value: unknown, field = 'payload'): Data => {
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

const cleanRunId = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value.trim())) {
    throw failure('invalid-argument', 'testRunId est invalide.', 'INVALID_FIXTURE');
  }
  return value.trim();
};

const optionalComment = (value: unknown, field: string): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim().length > 1000) {
    throw failure('invalid-argument', `${field} est invalide.`, 'INVALID_COMMENT');
  }
  return value.trim();
};

const positiveVersion = (value: unknown): number => {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw failure('invalid-argument', 'expectedVersion est invalide.', 'INVALID_VERSION');
  }
  return Number(value);
};

const active = (value: Data): boolean => value.active === true || value.isActive === true || value.status === 'active';
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const finite = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
const sha256 = (value: unknown): string => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const canonicalReportCardId = (schoolId: string, academicYearId: string, periodId: string, classId: string, studentId: string): string =>
  `rc_${crypto.createHash('sha256').update([schoolId, academicYearId, periodId, classId, studentId].join('\u0000')).digest('base64url')}`;

const fixtureFields = (input: Data): Data => {
  if (input.testFixture === undefined && input.testRunId === undefined) return {};
  if (input.testFixture !== true) throw failure('invalid-argument', 'testFixture doit valoir true.', 'INVALID_FIXTURE');
  return { testFixture: true, testRunId: cleanRunId(input.testRunId) };
};

const actorContext = async (uid: string, requestedSchoolId: unknown) => {
  const db = admin.firestore();
  const actorSnap = await db.collection('users').doc(uid).get();
  const actor = actorSnap.data() as Data | undefined;
  if (!actorSnap.exists || !actor || !active(actor)) throw failure('permission-denied', 'Compte actif requis.', 'PERMISSION_DENIED');
  const role = text(actor.role);
  if (!MANAGER_ROLES.has(role)) throw failure('permission-denied', 'Rôle pédagogique non autorisé.', 'PERMISSION_DENIED');
  const explicitSchoolId = cleanId(requestedSchoolId, 'schoolId');
  const actorSchoolId = text(actor.schoolId);
  const schoolId = role === 'superAdmin' ? explicitSchoolId : actorSchoolId;
  if (!schoolId || (role !== 'superAdmin' && explicitSchoolId !== actorSchoolId)) {
    throw failure('permission-denied', 'Accès inter-école refusé.', 'SCHOOL_MISMATCH');
  }
  return { db, actor, role, schoolId };
};

const assertProductionFixture = (actor: Data, fixture: Data) => {
  if (process.env.GCLOUD_PROJECT === 'ecoscolaire-c5861' && fixture.testFixture === true
      && (actor.testFixture !== true || actor.testRunId !== fixture.testRunId)) {
    throw failure('permission-denied', 'Fixture Production non autorisée.', 'FIXTURE_FORBIDDEN');
  }
};

interface SnapshotBuild {
  snapshot: Data;
  sourceHash: string;
  snapshotHash: string;
  blockingIssues: Data[];
  programRef: admin.firestore.DocumentReference;
  programRevisionId: string;
}

const buildSnapshot = async (db: admin.firestore.Firestore, ids: {
  schoolId: string;
  academicYearId: string;
  periodId: string;
  classId: string;
  studentId: string;
}): Promise<SnapshotBuild> => {
  const [schoolSnap, yearSnap, periodSnap, classSnap, studentSnap, programsSnap, assignmentsSnap, evaluationsSnap, gradesSnap] = await Promise.all([
    db.collection('schools').doc(ids.schoolId).get(),
    db.collection('academicYears').doc(ids.academicYearId).get(),
    db.collection('periods').doc(ids.periodId).get(),
    db.collection('classes').doc(ids.classId).get(),
    db.collection('students').doc(ids.studentId).get(),
    db.collection('classPrograms').where('schoolId', '==', ids.schoolId).get(),
    db.collection('teacherAssignments').where('schoolId', '==', ids.schoolId).get(),
    db.collection('evaluations').where('schoolId', '==', ids.schoolId).get(),
    db.collection('grades').where('schoolId', '==', ids.schoolId).get(),
  ]);
  if (!schoolSnap.exists || !yearSnap.exists || !periodSnap.exists || !classSnap.exists || !studentSnap.exists) {
    throw failure('not-found', 'Configuration du bulletin introuvable.', 'PEDAGOGICAL_CONFIGURATION_MISSING');
  }
  const school = schoolSnap.data() as Data;
  const year = yearSnap.data() as Data;
  const period = periodSnap.data() as Data;
  const klass = classSnap.data() as Data;
  const student = studentSnap.data() as Data;
  for (const dependency of [school, year, period, klass, student]) {
    if (dependency.schoolId !== undefined && dependency.schoolId !== ids.schoolId) {
      throw failure('permission-denied', 'Dépendance inter-école refusée.', 'SCHOOL_MISMATCH');
    }
  }
  if (period.academicYearId !== ids.academicYearId || period.status === 'draft' || period.status === 'archived') {
    throw failure('failed-precondition', 'Période non admissible.', 'PERIOD_NOT_ADMISSIBLE');
  }
  if (student.classId !== ids.classId || !active(student) || !active(klass)) {
    throw failure('failed-precondition', 'Élève ou classe non admissible.', 'STUDENT_CLASS_MISMATCH');
  }
  const programs = programsSnap.docs.filter(document => {
    const value = document.data();
    return value.academicYearId === ids.academicYearId && value.classId === ids.classId && value.status === 'published';
  });
  if (programs.length !== 1) throw failure('failed-precondition', 'Programme publié unique requis.', 'PROGRAM_NOT_PUBLISHED');
  const programSnap = programs[0];
  const program = programSnap.data() as Data;
  const programRevisionId = cleanId(program.publishedRevisionId, 'publishedRevisionId');
  const classSubjectsSnap = await db.collection('classSubjects').where('programId', '==', programSnap.id).get();
  const classSubjects = classSubjectsSnap.docs
    .filter(document => document.data().revisionId === programRevisionId && document.data().isActive !== false)
    .sort((left, right) => Number(left.data().displayOrder || 0) - Number(right.data().displayOrder || 0));
  if (!classSubjects.length) throw failure('failed-precondition', 'Programme publié vide.', 'PROGRAM_EMPTY');

  const assignments = assignmentsSnap.docs.map(document =>
    ({ id: document.id, ...document.data() } as Data & { id: string }))
    .filter(value => value.academicYearId === ids.academicYearId && value.classId === ids.classId
      && value.sourcePublishedRevisionId === programRevisionId && active(value));
  const missingAssignments = classSubjects.filter(subject => !assignments.some(assignment =>
    assignment.sourceClassSubjectId === subject.id || assignment.subjectId === subject.data().subjectId));
  if (missingAssignments.length) {
    throw failure('failed-precondition', 'Affectation enseignante active requise pour chaque matière.', 'TEACHER_ASSIGNMENT_REQUIRED');
  }

  const classSubjectIds = new Set(classSubjects.map(document => document.id));
  const evaluations = evaluationsSnap.docs.map(document => ({ id: document.id, updateTime: document.updateTime,
    ...document.data() } as Data & { id: string; updateTime: admin.firestore.Timestamp }))
    .filter(value => value.academicYearId === ids.academicYearId && value.periodId === ids.periodId
      && value.classId === ids.classId && value.status === 'published' && classSubjectIds.has(text(value.classSubjectId)))
    .sort((left, right) => left.id.localeCompare(right.id));
  const evaluationIds = new Set(evaluations.map(value => value.id));
  const grades = gradesSnap.docs.map(document => ({ id: document.id, updateTime: document.updateTime,
    ...document.data() } as Data & { id: string; updateTime: admin.firestore.Timestamp }))
    .filter(value => value.studentId === ids.studentId && evaluationIds.has(text(value.evaluationId)))
    .sort((left, right) => left.id.localeCompare(right.id));
  const gradeByEvaluation = new Map(grades.map(value => [text(value.evaluationId), value]));
  if (gradeByEvaluation.size !== grades.length) {
    throw failure('failed-precondition', 'Plusieurs notes canoniques existent pour une même évaluation.', 'GRADE_INTEGRITY_ERROR');
  }

  const blockingIssues: Data[] = [];
  const subjectResults = classSubjects.map(subjectDocument => {
    const subject = subjectDocument.data() as Data;
    const subjectEvaluations = evaluations.filter(value => value.classSubjectId === subjectDocument.id);
    const evaluationResults: Array<Data & CanonicalEvaluationScore> = subjectEvaluations.map(evaluation => {
      const grade = gradeByEvaluation.get(evaluation.id);
      const resultStatus = grade ? text(grade.resultStatus) || 'missing' : 'missing';
      const normalized = normalizeCanonicalGrade({
        evaluationId: evaluation.id,
        resultStatus,
        ...(finite(grade?.score) !== null ? { score: finite(grade?.score) as number } : {}),
        maxScore: finite(evaluation.maxScore) || finite(grade?.maxScore) || 20,
        weight: finite(evaluation.weight) || 1,
      });
      return {
        ...normalized,
        evaluationVersion: Number(evaluation.version || 1),
        gradeId: grade?.id || null,
        gradeVersion: grade ? Number(grade.version || 1) : null,
        evaluationTitle: text(evaluation.title),
        evaluationDate: text(evaluation.date),
      };
    });
    const coefficient = finite(subject.coefficient);
    const calculated = calculateCanonicalSubject(evaluationResults, coefficient);
    let status: string = 'VALID';
    if (!subjectEvaluations.length) status = 'NOT_EVALUATED';
    else if (calculated.status === 'no_grades') status = 'NO_CALCULABLE_GRADE';
    else if (calculated.status === 'missing_coefficient') status = 'MISSING_COEFFICIENT';
    if (status !== 'VALID') blockingIssues.push({ code: status, classSubjectId: subjectDocument.id, subjectId: subject.subjectId });
    return {
      classSubjectId: subjectDocument.id,
      subjectId: text(subject.subjectId),
      subjectName: text(subject.subjectNameSnapshot) || text(subject.name),
      subjectCode: text(subject.subjectCodeSnapshot) || text(subject.code),
      coefficient,
      status,
      evaluationCount: subjectEvaluations.length,
      scoredCount: evaluationResults.filter(value => value.calculable).length,
      absenceCount: evaluationResults.filter(value => value.status === 'absent').length,
      excusedCount: evaluationResults.filter(value => value.status === 'excused').length,
      evaluationResults,
      rawAverage: calculated.rawAverage,
      displayedAverage: calculated.displayedAverage,
      weightedPoints: calculated.weightedPoints,
      calculable: calculated.calculable,
    };
  });
  const overall = calculateCanonicalGeneral(subjectResults);
  const sourceRefs = {
    evaluationIds: evaluations.map(value => ({ id: value.id, version: Number(value.version || 1), updateTime: value.updateTime.toDate().toISOString() })),
    gradeIds: grades.map(value => ({ id: value.id, version: Number(value.version || 1), updateTime: value.updateTime.toDate().toISOString() })),
  };
  const snapshot: Data = {
    school: { id: ids.schoolId, name: text(school.name), logoUrl: text(school.logoUrl) || null },
    academicYear: { id: ids.academicYearId, name: text(year.name), startDate: text(year.startDate), endDate: text(year.endDate) },
    period: { id: ids.periodId, name: text(period.name), startDate: text(period.startDate), endDate: text(period.endDate) },
    class: { id: ids.classId, name: text(klass.name), section: text(klass.section), type: text(klass.type) },
    student: { id: ids.studentId, name: text(student.name), registrationNumber: text(student.registrationNumber) || null, section: text(student.section) },
    program: {
      id: programSnap.id,
      revisionId: programRevisionId,
      revisionNumber: Number(program.publishedRevisionNumber || 1),
    },
    subjectResults,
    overallResult: overall,
    blockingIssues,
    sourceRefs,
    policy: {
      normalizedScale: 20,
      eligibleEvaluationStatus: 'published',
      absence: 'PRESERVED_NOT_ZERO',
      missingGrade: 'BLOCK_VALIDATION',
      ranking: 'DEFERRED',
      mention: 'DEFERRED',
      promotionDecision: 'OUT_OF_SCOPE',
    },
  };
  const sourceHash = sha256({ programRevisionId, subjectResults, sourceRefs });
  return {
    snapshot,
    sourceHash,
    snapshotHash: sha256(snapshot),
    blockingIssues,
    programRef: programSnap.ref,
    programRevisionId,
  };
};

const reportCardIdsFromExisting = (existing: Data) => ({
  schoolId: cleanId(existing.schoolId, 'schoolId'),
  academicYearId: cleanId(existing.academicYearId, 'academicYearId'),
  periodId: cleanId(existing.periodId, 'periodId'),
  classId: cleanId(existing.classId, 'classId'),
  studentId: cleanId(existing.studentId, 'studentId'),
});

export const manageReportCard = functions.https.onCall(async (raw, context) => {
  const input = object(raw);
  if (!context.auth?.uid) throw failure('unauthenticated', 'Authentification requise.', 'UNAUTHENTICATED');
  const action = text(input.action) as ReportCardAction;
  if (!ACTIONS.has(action)) throw failure('invalid-argument', 'Action invalide.', 'INVALID_ACTION');
  const { db, actor, role, schoolId } = await actorContext(context.auth.uid, input.schoolId);
  const directorComment = optionalComment(input.directorComment, 'directorComment');
  const fixture = fixtureFields(input);
  assertProductionFixture(actor, fixture);

  if (action === 'GENERATE_DRAFT') {
    const ids = {
      schoolId,
      academicYearId: cleanId(input.academicYearId, 'academicYearId'),
      periodId: cleanId(input.periodId, 'periodId'),
      classId: cleanId(input.classId, 'classId'),
      studentId: cleanId(input.studentId, 'studentId'),
    };
    const reportCardId = canonicalReportCardId(ids.schoolId, ids.academicYearId, ids.periodId, ids.classId, ids.studentId);
    const built = await buildSnapshot(db, ids);
    const reportRef = db.collection('reportCards').doc(reportCardId);
    const changed = await db.runTransaction(async transaction => {
      const [existingSnap, programSnap] = await Promise.all([transaction.get(reportRef), transaction.get(built.programRef)]);
      if (!programSnap.exists || programSnap.data()?.status !== 'published'
          || programSnap.data()?.publishedRevisionId !== built.programRevisionId) {
        throw failure('aborted', 'Le programme publié a changé.', 'PROGRAM_REVISION_CHANGED');
      }
      if (existingSnap.exists) {
        const existing = existingSnap.data() as Data;
        if (existing.status === 'draft' && existing.sourceHash === built.sourceHash
            && text(existing.directorComment) === (directorComment || '')) return false;
        throw failure('already-exists', 'Un bulletin canonique existe déjà.', 'REPORT_CARD_EXISTS');
      }
      const now = FieldValue.serverTimestamp();
      transaction.set(reportRef, {
        id: reportCardId, ...ids,
        programId: built.programRef.id, programRevisionId: built.programRevisionId,
        programRevisionNumber: (built.snapshot.program as Data).revisionNumber,
        status: 'draft', version: 1, immutable: false,
        snapshot: built.snapshot, sourceHash: built.sourceHash, snapshotHash: built.snapshotHash,
        teacherComment: null, directorComment: directorComment || '',
        createdAt: now, createdBy: context.auth!.uid, updatedAt: now, updatedBy: context.auth!.uid,
        ...fixture,
      });
      transaction.set(db.collection('audit_logs').doc(), {
        actorUid: context.auth!.uid, actorRole: role, schoolId,
        action: 'REPORT_CARD_DRAFT_GENERATED', targetType: 'reportCard', targetId: reportCardId,
        details: { academicYearId: ids.academicYearId, periodId: ids.periodId, classId: ids.classId,
          studentId: ids.studentId, programId: built.programRef.id, programRevisionId: built.programRevisionId, status: 'draft' },
        timestamp: now, createdAt: now, canonicalBackendAudit: true, ...fixture,
      });
      return true;
    });
    return { success: true, changed, reportCard: (await reportRef.get()).data() };
  }

  const reportCardId = cleanId(input.reportCardId, 'reportCardId');
  const expectedVersion = positiveVersion(input.expectedVersion);
  const reportRef = db.collection('reportCards').doc(reportCardId);
  const initialSnap = await reportRef.get();
  if (!initialSnap.exists) throw failure('not-found', 'Bulletin introuvable.', 'REPORT_CARD_NOT_FOUND');
  const initial = initialSnap.data() as Data;
  if (initial.schoolId !== schoolId) throw failure('permission-denied', 'Accès inter-école refusé.', 'SCHOOL_MISMATCH');
  const ids = reportCardIdsFromExisting(initial);

  if (action === 'REFRESH_DRAFT') {
    const built = await buildSnapshot(db, ids);
    const changed = await db.runTransaction(async transaction => {
      const [currentSnap, programSnap] = await Promise.all([transaction.get(reportRef), transaction.get(built.programRef)]);
      const current = currentSnap.data() as Data | undefined;
      if (!currentSnap.exists || !current) throw failure('not-found', 'Bulletin introuvable.', 'REPORT_CARD_NOT_FOUND');
      if (current.status !== 'draft') throw failure('failed-precondition', 'Seul un brouillon peut être recalculé.', 'REPORT_CARD_IMMUTABLE');
      if (Number(current.version) !== expectedVersion) throw failure('aborted', 'Version obsolète.', 'VERSION_CONFLICT');
      if (!programSnap.exists || programSnap.data()?.publishedRevisionId !== built.programRevisionId) {
        throw failure('aborted', 'Le programme publié a changé.', 'PROGRAM_REVISION_CHANGED');
      }
      const nextComment = directorComment === undefined ? text(current.directorComment) : directorComment;
      if (current.sourceHash === built.sourceHash && text(current.directorComment) === nextComment) return false;
      const now = FieldValue.serverTimestamp();
      transaction.update(reportRef, {
        programId: built.programRef.id, programRevisionId: built.programRevisionId,
        programRevisionNumber: (built.snapshot.program as Data).revisionNumber,
        snapshot: built.snapshot, sourceHash: built.sourceHash, snapshotHash: built.snapshotHash,
        directorComment: nextComment, version: expectedVersion + 1, updatedAt: now, updatedBy: context.auth!.uid,
      });
      transaction.set(db.collection('audit_logs').doc(), {
        actorUid: context.auth!.uid, actorRole: role, schoolId,
        action: 'REPORT_CARD_DRAFT_REFRESHED', targetType: 'reportCard', targetId: reportCardId,
        details: { academicYearId: ids.academicYearId, periodId: ids.periodId, classId: ids.classId,
          studentId: ids.studentId, programId: built.programRef.id, programRevisionId: built.programRevisionId, status: 'draft' },
        timestamp: now, createdAt: now, canonicalBackendAudit: true, ...fixture,
      });
      return true;
    });
    return { success: true, changed, reportCard: (await reportRef.get()).data() };
  }

  if (action === 'VALIDATE') {
    if (initial.status !== 'draft') throw failure('failed-precondition', 'Transition DRAFT vers VALIDATED requise.', 'INVALID_STATUS');
    const built = await buildSnapshot(db, ids);
    if (built.sourceHash !== initial.sourceHash) {
      throw failure('failed-precondition', 'Les sources ont changé; recalcul explicite requis.', 'SOURCES_CHANGED_REFRESH_REQUIRED');
    }
    if (built.blockingIssues.length) {
      throw failure('failed-precondition', 'Le bulletin contient des résultats incomplets.', 'REPORT_CARD_INCOMPLETE');
    }
    await db.runTransaction(async transaction => {
      const [currentSnap, programSnap] = await Promise.all([transaction.get(reportRef), transaction.get(built.programRef)]);
      const current = currentSnap.data() as Data | undefined;
      if (!currentSnap.exists || !current || current.status !== 'draft') throw failure('aborted', 'État du bulletin modifié.', 'VERSION_CONFLICT');
      if (Number(current.version) !== expectedVersion) throw failure('aborted', 'Version obsolète.', 'VERSION_CONFLICT');
      if (current.sourceHash !== built.sourceHash || programSnap.data()?.publishedRevisionId !== built.programRevisionId) {
        throw failure('aborted', 'Sources pédagogiques modifiées.', 'SOURCES_CHANGED_REFRESH_REQUIRED');
      }
      const now = FieldValue.serverTimestamp();
      transaction.update(reportRef, {
        status: 'validated', version: expectedVersion + 1,
        directorComment: directorComment === undefined ? text(current.directorComment) : directorComment,
        validatedAt: now, validatedBy: context.auth!.uid, updatedAt: now, updatedBy: context.auth!.uid,
      });
      transaction.set(db.collection('audit_logs').doc(), {
        actorUid: context.auth!.uid, actorRole: role, schoolId,
        action: 'REPORT_CARD_VALIDATED', targetType: 'reportCard', targetId: reportCardId,
        details: { academicYearId: ids.academicYearId, periodId: ids.periodId, classId: ids.classId,
          studentId: ids.studentId, programId: built.programRef.id, programRevisionId: built.programRevisionId, status: 'validated' },
        timestamp: now, createdAt: now, canonicalBackendAudit: true, ...fixture,
      });
    });
    return { success: true, changed: true, reportCard: (await reportRef.get()).data() };
  }

  await db.runTransaction(async transaction => {
    const currentSnap = await transaction.get(reportRef);
    const current = currentSnap.data() as Data | undefined;
    if (!currentSnap.exists || !current || current.status !== 'validated') {
      throw failure('failed-precondition', 'Transition VALIDATED vers PUBLISHED requise.', 'INVALID_STATUS');
    }
    if (Number(current.version) !== expectedVersion) throw failure('aborted', 'Version obsolète.', 'VERSION_CONFLICT');
    const programRef = db.collection('classPrograms').doc(cleanId(current.programId, 'programId'));
    const programSnap = await transaction.get(programRef);
    if (!programSnap.exists || programSnap.data()?.publishedRevisionId !== current.programRevisionId) {
      throw failure('failed-precondition', 'La révision du programme a changé.', 'PROGRAM_REVISION_CHANGED');
    }
    const now = FieldValue.serverTimestamp();
    const nextDirectorComment = directorComment === undefined ? text(current.directorComment) : directorComment;
    const officialSnapshot = { ...(current.snapshot as Data), teacherComment: current.teacherComment || null, directorComment: nextDirectorComment };
    transaction.update(reportRef, {
      status: 'published', version: expectedVersion + 1, immutable: true,
      directorComment: nextDirectorComment, officialSnapshot, officialSnapshotHash: sha256(officialSnapshot),
      publishedAt: now, publishedBy: context.auth!.uid, updatedAt: now, updatedBy: context.auth!.uid,
    });
    transaction.set(db.collection('audit_logs').doc(), {
      actorUid: context.auth!.uid, actorRole: role, schoolId,
      action: 'REPORT_CARD_PUBLISHED', targetType: 'reportCard', targetId: reportCardId,
      details: { academicYearId: ids.academicYearId, periodId: ids.periodId, classId: ids.classId,
        studentId: ids.studentId, programId: current.programId, programRevisionId: current.programRevisionId, status: 'published' },
      timestamp: now, createdAt: now, canonicalBackendAudit: true, ...fixture,
    });
  });
  return { success: true, changed: true, reportCard: (await reportRef.get()).data() };
});

export const reportCardTestContracts = { canonicalReportCardId, sha256 };
