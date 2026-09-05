import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { adoptionId, addDaysIso, mondayIso, teachingPlanId, teachingWeekId } from './ids';
import { audit, requireId, requirePedagogyActor } from './authorization';
import { deterministicPlanningGenerator, GeneratorSubject, GeneratorUnit } from './planningGenerator';

const db = () => admin.firestore();
const requiredText = (value: unknown, name: string, max = 500): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new functions.https.HttpsError('invalid-argument', `${name} invalide.`);
  return value.trim();
};
const optionalText = (value: unknown, max = 1000): string => typeof value === 'string' ? value.trim().slice(0, max) : '';
const isActive = (value: admin.firestore.DocumentData): boolean => value.isActive !== false && value.active !== false && !['inactive', 'archived'].includes(value.status);
const schoolData = (snap: admin.firestore.DocumentSnapshot, schoolId: string, label: string): admin.firestore.DocumentData => {
  if (!snap.exists) throw new functions.https.HttpsError('not-found', `${label} introuvable.`);
  const value = snap.data()!;
  if (value.schoolId !== schoolId) throw new functions.https.HttpsError('permission-denied', 'Accès inter-écoles interdit.');
  return value;
};

export const adoptCurriculumProgram = functions.https.onCall(async (data, context) => {
  const { actor, schoolId } = await requirePedagogyActor(context, data?.schoolId);
  const academicYearId = requireId(data?.academicYearId, 'academicYearId');
  const catalogLevelId = requireId(data?.catalogLevelId, 'catalogLevelId');
  const curriculumProgramId = requireId(data?.curriculumProgramId, 'curriculumProgramId');
  const ref = db().collection('schoolCurriculumAdoptions').doc(adoptionId(schoolId, academicYearId, catalogLevelId));
  const [yearSnap, programSnap] = await Promise.all([
    db().collection('academicYears').doc(academicYearId).get(),
    db().collection('curriculumPrograms').doc(curriculumProgramId).get()
  ]);
  const year = schoolData(yearSnap, schoolId, 'Année scolaire');
  if (!isActive(year)) throw new functions.https.HttpsError('failed-precondition', 'Année scolaire inactive.');
  if (!programSnap.exists || programSnap.data()?.status !== 'published') throw new functions.https.HttpsError('failed-precondition', 'Programme national non publié.');
  await db().runTransaction(async transaction => {
    const previous = await transaction.get(ref);
    transaction.set(ref, {
      id: ref.id, schoolId, academicYearId, catalogLevelId, curriculumProgramId, status: 'active',
      adoptedAt: admin.firestore.FieldValue.serverTimestamp(), adoptedBy: actor.uid,
      createdAt: previous.exists ? previous.data()?.createdAt : admin.firestore.FieldValue.serverTimestamp(),
      createdBy: previous.exists ? previous.data()?.createdBy : actor.uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: actor.uid
    }, { merge: true });
    audit(transaction, actor, schoolId, 'CURRICULUM_PROGRAM_ADOPTED', 'schoolCurriculumAdoption', ref.id, { academicYearId, catalogLevelId, curriculumProgramId });
  });
  return { adoptionId: ref.id, curriculumProgramId };
});

export const ensureTeachingWeeks = functions.https.onCall(async (data, context) => {
  const { actor, schoolId } = await requirePedagogyActor(context, data?.schoolId);
  const academicYearId = requireId(data?.academicYearId, 'academicYearId');
  const yearSnap = await db().collection('academicYears').doc(academicYearId).get();
  const year = schoolData(yearSnap, schoolId, 'Année scolaire');
  const periodsSnap = await db().collection('periods').where('academicYearId', '==', academicYearId).get();
  const periods = (periodsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Array<admin.firestore.DocumentData & { id: string }>).filter(period => period.schoolId === schoolId && isActive(period));
  let current = mondayIso(requiredText(year.startDate, 'startDate', 10));
  if (current < year.startDate) current = addDaysIso(current, 7);
  const weeks: Array<{ id: string; weekStartDate: string; weekEndDate: string; weekNumber: number; periodId?: string }> = [];
  while (current <= year.endDate && weeks.length < 60) {
    const periodId = periods.find(period => period.startDate <= current && period.endDate >= current)?.id;
    weeks.push({ id: teachingWeekId(schoolId, academicYearId, current), weekStartDate: current, weekEndDate: addDaysIso(current, 4), weekNumber: weeks.length + 1, ...(periodId ? { periodId } : {}) });
    current = addDaysIso(current, 7);
  }
  if (!weeks.length) throw new functions.https.HttpsError('failed-precondition', 'Aucune semaine ouvrée dans cette année.');
  const batch = db().batch();
  weeks.forEach(week => batch.set(db().collection('teachingWeeks').doc(week.id), {
    ...week, schoolId, academicYearId, status: 'open', updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: actor.uid
  }, { merge: true }));
  batch.create(db().collection('audit_logs').doc(), {
    schoolId, action: 'TEACHING_WEEKS_ENSURED', actorUid: actor.uid, actorRole: actor.role,
    targetType: 'academicYear', targetId: academicYearId, details: { weekCount: weeks.length },
    timestamp: admin.firestore.FieldValue.serverTimestamp(), createdAt: admin.firestore.FieldValue.serverTimestamp(), canonicalBackendAudit: true
  });
  await batch.commit();
  return { weekCount: weeks.length, firstWeekId: weeks[0].id, lastWeekId: weeks[weeks.length - 1].id };
});

export const ensureTeachingPlanDraft = functions.https.onCall(async (data, context) => {
  const { actor, schoolId } = await requirePedagogyActor(context, data?.schoolId);
  const academicYearId = requireId(data?.academicYearId, 'academicYearId');
  const classId = requireId(data?.classId, 'classId');
  const weekStartDate = mondayIso(requiredText(data?.weekStartDate, 'weekStartDate', 10));
  const planId = teachingPlanId(schoolId, academicYearId, classId, weekStartDate);
  const ref = db().collection('teachingPlans').doc(planId);
  return db().runTransaction(async transaction => {
    const [existing, classSnap, yearSnap, weekSnap] = await Promise.all([
      transaction.get(ref), transaction.get(db().collection('classes').doc(classId)),
      transaction.get(db().collection('academicYears').doc(academicYearId)),
      transaction.get(db().collection('teachingWeeks').doc(teachingWeekId(schoolId, academicYearId, weekStartDate)))
    ]);
    const classroom = schoolData(classSnap, schoolId, 'Classe');
    schoolData(yearSnap, schoolId, 'Année scolaire');
    const week = schoolData(weekSnap, schoolId, 'Semaine pédagogique');
    if (!isActive(classroom)) throw new functions.https.HttpsError('failed-precondition', 'Classe inactive.');
    if (existing.exists) return { planId, created: false, status: existing.data()?.status };
    transaction.create(ref, {
      id: planId, schoolId, academicYearId, classId, weekId: weekSnap.id, weekStartDate,
      weekEndDate: week.weekEndDate, weekNumber: week.weekNumber, periodId: week.periodId || null, status: 'draft', version: 1,
      createdAt: admin.firestore.FieldValue.serverTimestamp(), createdBy: actor.uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: actor.uid
    });
    audit(transaction, actor, schoolId, 'TEACHING_PLAN_DRAFT_CREATED', 'teachingPlan', planId, { academicYearId, classId, weekStartDate });
    return { planId, created: true, status: 'draft' };
  });
});

export const generateTeachingPlanProposal = functions.https.onCall(async (data, context) => {
  const { actor, schoolId } = await requirePedagogyActor(context, data?.schoolId);
  const planId = requireId(data?.planId, 'planId');
  const planRef = db().collection('teachingPlans').doc(planId);
  const plan = schoolData(await planRef.get(), schoolId, 'Planification');
  if (['teacher_validated', 'archived'].includes(plan.status)) throw new functions.https.HttpsError('failed-precondition', 'Planification verrouillée.');
  const classroom = schoolData(await db().collection('classes').doc(plan.classId).get(), schoolId, 'Classe');
  const catalogLevelId = requiredText(classroom.catalogLevelId, 'catalogLevelId', 100);
  const adoption = schoolData(await db().collection('schoolCurriculumAdoptions').doc(adoptionId(schoolId, plan.academicYearId, catalogLevelId)).get(), schoolId, 'Adoption du programme');
  if (adoption.status !== 'active') throw new functions.https.HttpsError('failed-precondition', 'Adoption inactive.');
  const programs = await db().collection('classPrograms').where('schoolId', '==', schoolId).where('academicYearId', '==', plan.academicYearId).where('classId', '==', plan.classId).limit(1).get();
  if (programs.empty || programs.docs[0].data().status !== 'published') throw new functions.https.HttpsError('failed-precondition', 'Programme de classe non publié.');
  const publishedRevisionId = programs.docs[0].data().publishedRevisionId;
  const [subjectsSnap, assignmentsSnap, unitsSnap] = await Promise.all([
    db().collection('classSubjects').where('revisionId', '==', publishedRevisionId).get(),
    db().collection('teacherAssignments').where('schoolId', '==', schoolId).where('academicYearId', '==', plan.academicYearId).where('classId', '==', plan.classId).get(),
    db().collection('curriculumUnits').where('programId', '==', adoption.curriculumProgramId).where('catalogLevelId', '==', catalogLevelId).get()
  ]);
  const assignmentBySubject = new Map(assignmentsSnap.docs.filter(doc => isActive(doc.data())).map(doc => [doc.data().subjectId, doc.data()]));
  const subjects: GeneratorSubject[] = subjectsSnap.docs.filter(doc => doc.data().isActive !== false).map(doc => {
    const subject = doc.data();
    const assignment = assignmentBySubject.get(subject.subjectId);
    if (!assignment?.teacherStaffId) throw new functions.https.HttpsError('failed-precondition', `Enseignant manquant pour ${subject.subjectNameSnapshot}.`);
    return { subjectId: subject.subjectId, subjectName: subject.subjectNameSnapshot, teacherStaffId: assignment.teacherStaffId, weeklyHours: subject.weeklyHours || 1 };
  });
  const units: GeneratorUnit[] = unitsSnap.docs.map(doc => ({ id: doc.id, subjectId: doc.data().subjectId, title: doc.data().title, objective: doc.data().objective, sequence: doc.data().sequence || 0 }));
  const items = deterministicPlanningGenerator.generate({ planId, weekNumber: plan.weekNumber, subjects, units });
  if (!items.length) throw new functions.https.HttpsError('failed-precondition', 'Aucune unité de programme compatible.');
  await db().runTransaction(async transaction => {
    const fresh = schoolData(await transaction.get(planRef), schoolId, 'Planification');
    if (['teacher_validated', 'archived'].includes(fresh.status)) throw new functions.https.HttpsError('failed-precondition', 'Planification verrouillée.');
    items.forEach(item => transaction.set(db().collection('teachingPlanItems').doc(item.id), {
      ...item, schoolId, planId, academicYearId: plan.academicYearId, classId: plan.classId,
      weekStartDate: plan.weekStartDate, generatorVersion: deterministicPlanningGenerator.version,
      createdAt: admin.firestore.FieldValue.serverTimestamp(), createdBy: actor.uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: actor.uid
    }, { merge: true }));
    transaction.update(planRef, {
      status: 'proposed', itemCount: items.length, generatorVersion: deterministicPlanningGenerator.version,
      version: (fresh.version || 1) + 1, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: actor.uid
    });
    audit(transaction, actor, schoolId, 'TEACHING_PLAN_PROPOSED', 'teachingPlan', planId, { itemCount: items.length, generatorVersion: deterministicPlanningGenerator.version });
  });
  return { planId, status: 'proposed', itemCount: items.length, generatorVersion: deterministicPlanningGenerator.version };
});

export const saveTeachingPlanAdjustments = functions.https.onCall(async (data, context) => {
  const { actor, schoolId } = await requirePedagogyActor(context, data?.schoolId);
  const planId = requireId(data?.planId, 'planId');
  if (!Array.isArray(data?.adjustments) || !data.adjustments.length || data.adjustments.length > 100) throw new functions.https.HttpsError('invalid-argument', 'adjustments invalide.');
  const planRef = db().collection('teachingPlans').doc(planId);
  const adjustmentRefs = data.adjustments.map((item: unknown) => db().collection('teachingPlanItems').doc(requireId((item as { id?: unknown })?.id, 'item.id')));
  await db().runTransaction(async transaction => {
    const [planSnap, ...itemSnaps] = await Promise.all([transaction.get(planRef), ...adjustmentRefs.map((ref: admin.firestore.DocumentReference) => transaction.get(ref))]);
    const plan = schoolData(planSnap, schoolId, 'Planification');
    if (!['draft', 'proposed', 'needs_adjustment', 'adjusted'].includes(plan.status)) throw new functions.https.HttpsError('failed-precondition', 'Transition non autorisée.');
    itemSnaps.forEach((snap, index) => {
      const item = schoolData(snap, schoolId, 'Séance');
      if (item.planId !== planId) throw new functions.https.HttpsError('permission-denied', 'Séance hors planification.');
      const raw = data.adjustments[index];
      transaction.update(snap.ref, {
        lessonTitle: requiredText(raw.lessonTitle ?? item.lessonTitle, 'lessonTitle'), objective: optionalText(raw.objective ?? item.objective),
        note: optionalText(raw.note), status: 'adjusted', updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: actor.uid
      });
    });
    transaction.update(planRef, { status: 'adjusted', version: (plan.version || 1) + 1, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: actor.uid });
    audit(transaction, actor, schoolId, 'TEACHING_PLAN_ADJUSTED', 'teachingPlan', planId, { adjustmentCount: data.adjustments.length });
  });
  return { planId, status: 'adjusted' };
});

export const recordTeacherPlanValidation = functions.https.onCall(async (data, context) => {
  const { actor, schoolId } = await requirePedagogyActor(context, data?.schoolId);
  const planId = requireId(data?.planId, 'planId');
  const teacherStaffId = requireId(data?.teacherStaffId, 'teacherStaffId');
  const planRef = db().collection('teachingPlans').doc(planId);
  const items = await db().collection('teachingPlanItems').where('schoolId', '==', schoolId).where('planId', '==', planId).get();
  await db().runTransaction(async transaction => {
    const [planSnap, teacherSnap] = await Promise.all([transaction.get(planRef), transaction.get(db().collection('staff').doc(teacherStaffId))]);
    const plan = schoolData(planSnap, schoolId, 'Planification');
    const teacher = schoolData(teacherSnap, schoolId, 'Enseignant');
    if (!['proposed', 'needs_adjustment', 'adjusted'].includes(plan.status)) throw new functions.https.HttpsError('failed-precondition', 'Transition vers validation non autorisée.');
    if (!isActive(teacher)) throw new functions.https.HttpsError('failed-precondition', 'Enseignant inactif.');
    transaction.update(planRef, {
      status: 'teacher_validated', teacherValidated: true, teacherStaffId,
      teacherValidatedAt: admin.firestore.FieldValue.serverTimestamp(),
      teacherValidationRecordedBy: actor.uid, teacherValidationRecordedAt: admin.firestore.FieldValue.serverTimestamp(),
      teacherValidationNote: optionalText(data?.note),
      version: (plan.version || 1) + 1, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: actor.uid
    });
    items.docs.forEach(item => transaction.update(item.ref, {
      status: 'teacher_validated', teacherValidatedAt: admin.firestore.FieldValue.serverTimestamp(),
      teacherStaffId, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: actor.uid
    }));
    audit(transaction, actor, schoolId, 'TEACHING_PLAN_TEACHER_VALIDATED', 'teachingPlan', planId, {
      teacherStaffId, itemCount: items.size, declarationRecordedBySecretary: actor.role === 'secretary'
    });
  });
  return { planId, status: 'teacher_validated', teacherStaffId };
});

export const archiveTeachingPlan = functions.https.onCall(async (data, context) => {
  const { actor, schoolId } = await requirePedagogyActor(context, data?.schoolId);
  const planId = requireId(data?.planId, 'planId');
  const ref = db().collection('teachingPlans').doc(planId);
  await db().runTransaction(async transaction => {
    const plan = schoolData(await transaction.get(ref), schoolId, 'Planification');
    if (plan.status !== 'teacher_validated') throw new functions.https.HttpsError('failed-precondition', 'Seule une planification validée peut être archivée.');
    transaction.update(ref, { status: 'archived', archivedAt: admin.firestore.FieldValue.serverTimestamp(), archivedBy: actor.uid, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: actor.uid });
    audit(transaction, actor, schoolId, 'TEACHING_PLAN_ARCHIVED', 'teachingPlan', planId, {});
  });
  return { planId, status: 'archived' };
});
