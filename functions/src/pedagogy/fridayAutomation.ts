import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { createHash, randomUUID } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { audit, requireId, requirePedagogyActor } from './authorization';
import { activePedagogyDocument } from './scopes';
import { mondayIso } from './ids';
import { FRIDAY_TIME_ZONE, fridayWindow, parseFridayPolicy } from './fridayPolicy';
import { generateWeeklyAssessmentForActor } from './weeklyAssessments';

const configurationCollection = 'pedagogyFridayConfigurations';
const runCollection = 'pedagogyFridayRuns';
const safeError = (error: unknown) => error instanceof Error && /^[A-Z_0-9]+$/.test(error.message) ? error.message : 'FRIDAY_ATTEMPT_FAILED_REVIEW_REQUIRED';

export const savePedagogyFridayConfiguration = functions.https.onCall(async (raw, context) => {
  const { actor, schoolId } = await requirePedagogyActor(context, raw?.schoolId, ['superAdmin', 'owner', 'director']);
  const academicYearId = requireId(raw?.academicYearId, 'academicYearId');
  let policy;
  try { policy = parseFridayPolicy(raw?.policy); } catch { throw new functions.https.HttpsError('invalid-argument', 'Horaire ou classes invalides.'); }
  const db = admin.firestore(), ref = db.collection(configurationCollection).doc(schoolId);
  return db.runTransaction(async transaction => {
    const refs = policy.classIds.map(id => db.collection('classes').doc(id));
    const [school, year, current] = await Promise.all([transaction.get(db.collection('schools').doc(schoolId)), transaction.get(db.collection('academicYears').doc(academicYearId)), transaction.get(ref)]);
    const classes = refs.length ? await transaction.getAll(...refs) : [];
    if (!school.exists || school.data()?.activeAcademicYearId !== academicYearId || year.data()?.schoolId !== schoolId || year.data()?.status !== 'active') throw new functions.https.HttpsError('failed-precondition', 'Année active de l’établissement requise.');
    if (classes.some(item => !item.exists || item.data()?.schoolId !== schoolId || !activePedagogyDocument(item.data()!))) throw new functions.https.HttpsError('permission-denied', 'Classe inactive ou hors établissement.');
    if (raw.expectedVersion !== (current.data()?.version || 0)) throw new functions.https.HttpsError('aborted', 'Configuration modifiée : rechargez.');
    const version = (current.data()?.version || 0) + 1;
    const record = { id: schoolId, schoolId, academicYearId, ...policy, timeZone: FRIDAY_TIME_ZONE, version, updatedBy: actor.uid, updatedAt: FieldValue.serverTimestamp() };
    transaction.set(ref, record);
    transaction.create(ref.collection('versions').doc(String(version)), record);
    audit(transaction, actor, schoolId, 'pedagogy_friday_configuration_saved', 'pedagogyFridayConfiguration', schoolId, { version, enabled: policy.enabled, classCount: policy.classIds.length, localTime: policy.localTime });
    return { version };
  });
});

/** Shared by the scheduled entry point and controlled integration tests.
 * No caller-supplied identity, teacher approval or alternate generator is used. */
export async function runPedagogyFriday(now = new Date()) {
  const db = admin.firestore();
  let cursor: admin.firestore.QueryDocumentSnapshot | undefined;
  let attempts = 0, visited = 0;
  for (;;) {
    const base = db.collection(configurationCollection).where('enabled', '==', true).orderBy(admin.firestore.FieldPath.documentId()).limit(20);
    const configs = await (cursor ? base.startAfter(cursor) : base).get();
    if (configs.empty) return { attempts, visited };
    for (const configSnapshot of configs.docs) {
      visited += 1;
      if (visited > 200) throw new Error('FRIDAY_CONFIGURATION_SCAN_LIMIT');
      const config = configSnapshot.data(), schoolId = configSnapshot.id;
      let policy;
      try { policy = parseFridayPolicy(config); } catch {
        await configSnapshot.ref.update({ lastError: 'FRIDAY_CONFIGURATION_INVALID', lastAttemptAt: FieldValue.serverTimestamp() });
        continue;
      }
      if (config.schoolId !== schoolId || !fridayWindow(now, policy).due) continue;
      const date = fridayWindow(now, policy).date;
      const [school, year, weeks] = await Promise.all([
        db.collection('schools').doc(schoolId).get(),
        db.collection('academicYears').doc(config.academicYearId).get(),
        db.collection('teachingWeeks').where('schoolId', '==', schoolId).where('academicYearId', '==', config.academicYearId).where('weekStartDate', '==', mondayIso(date)).limit(2).get()
      ]);
      if (!school.exists || school.data()?.activeAcademicYearId !== config.academicYearId || year.data()?.schoolId !== schoolId || year.data()?.status !== 'active' || date < year.data()!.startDate || date > year.data()!.endDate || weeks.size !== 1 || weeks.docs[0].data().status !== 'open') {
        await configSnapshot.ref.update({ lastError: 'FRIDAY_ACTIVE_WEEK_REQUIRED', lastAttemptAt: FieldValue.serverTimestamp() });
        continue;
      }
      const weekId = weeks.docs[0].id;
      for (const classId of policy.classIds) {
        const scope = { schoolId, academicYearId: config.academicYearId, classId, weekId };
        const id = createHash('sha256').update(JSON.stringify(scope)).digest('hex');
        const ref = db.collection(runCollection).doc(id), lease = randomUUID();
        const claimed = await db.runTransaction(async transaction => {
          const [existing, freshConfig] = await Promise.all([transaction.get(ref), transaction.get(configSnapshot.ref)]);
          const previous = existing.data();
          if (freshConfig.data()?.enabled !== true || freshConfig.data()?.version !== config.version ||
              previous?.status === 'succeeded' || (previous?.attempts || 0) >= 3 ||
              (previous?.leaseUntil?.toMillis?.() || 0) > now.getTime()) return false;
          transaction.set(ref, { ...scope, status: 'processing', attempts: (previous?.attempts || 0) + 1, configurationVersion: config.version, lease, leaseUntil: Timestamp.fromMillis(now.getTime() + 10 * 60_000), lastAttemptAt: FieldValue.serverTimestamp() }, { merge: true });
          return true;
        });
        if (!claimed) continue;
        attempts += 1;
        let status = 'retryable', errorCode: string | null = null, assessmentId: string | null = null;
        try {
          const result = await generateWeeklyAssessmentForActor(scope, schoolId, { uid: 'system:pedagogy-friday', role: 'system', schoolId });
          assessmentId = result.assessmentId;
          if (['needs_review', 'teacher_validated', 'ready_to_print'].includes(result.status)) status = 'succeeded';
          else errorCode = 'FRIDAY_GENERATION_NOT_COMPLETED';
        } catch (error) { errorCode = safeError(error); }
        await db.runTransaction(async transaction => {
          const current = await transaction.get(ref);
          if (current.data()?.lease !== lease) return;
          transaction.update(ref, { status, errorCode, assessmentId, leaseUntil: Timestamp.fromMillis(0), completedAt: FieldValue.serverTimestamp(), scheduledFor: Timestamp.fromDate(now) });
        });
        await configSnapshot.ref.update({ lastAttemptAt: FieldValue.serverTimestamp(), ...(status === 'succeeded' ? { lastSuccessAt: FieldValue.serverTimestamp(), lastError: null } : { lastError: errorCode }) });
        // At most three potentially slow provider requests per invocation. Other
        // classes continue on the next tick; completed run keys are not repeated.
        if (attempts >= 3) return { attempts, visited };
      }
    }
    cursor = configs.docs[configs.docs.length - 1];
    if (configs.size < 20) return { attempts, visited };
  }
}

export const pedagogyFridayScheduler = functions.runWith({ timeoutSeconds: 540, memory: '512MB' })
  .pubsub.schedule('every 15 minutes').timeZone(FRIDAY_TIME_ZONE).onRun(async () => { await runPedagogyFriday(); });
