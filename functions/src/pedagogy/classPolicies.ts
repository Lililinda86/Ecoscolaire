import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { audit, requireId, requirePedagogyActor } from './authorization';
import { defaultPedagogyPolicy, parsePedagogyPolicy } from './pedagogyPolicy';
import { activePedagogyDocument } from './scopes';
export const pedagogyPolicyId = (schoolId: string, academicYearId: string, classId: string) => createHash('sha256').update(JSON.stringify([schoolId, academicYearId, classId])).digest('hex');
export async function readClassPedagogyPolicy(schoolId: string, academicYearId: string, classId: string, classroom: admin.firestore.DocumentData) {
  const snap = await admin.firestore().collection('pedagogyClassPolicies').doc(pedagogyPolicyId(schoolId, academicYearId, classId)).get();
  if (!snap.exists) return { ...defaultPedagogyPolicy(classroom), configured: false };
  const value = snap.data()!;
  if (value.schoolId !== schoolId || value.academicYearId !== academicYearId || value.classId !== classId) throw new functions.https.HttpsError('permission-denied', 'Politique hors périmètre.');
  return { ...parsePedagogyPolicy(value.policy, classroom, value.version), configured: true };
}
export const savePedagogyClassPolicy = functions.https.onCall(async (raw, context) => {
  const { actor, schoolId } = await requirePedagogyActor(context, raw?.schoolId, ['superAdmin', 'owner', 'director']);
  const academicYearId = requireId(raw?.academicYearId, 'academicYearId'), classId = requireId(raw?.classId, 'classId');
  const db = admin.firestore(), id = pedagogyPolicyId(schoolId, academicYearId, classId), ref = db.collection('pedagogyClassPolicies').doc(id);
  return db.runTransaction(async transaction => {
    const [classSnap, yearSnap, current] = await Promise.all([transaction.get(db.collection('classes').doc(classId)), transaction.get(db.collection('academicYears').doc(academicYearId)), transaction.get(ref)]);
    if (!classSnap.exists || !yearSnap.exists || classSnap.data()?.schoolId !== schoolId || yearSnap.data()?.schoolId !== schoolId) throw new functions.https.HttpsError('permission-denied', 'Classe ou année hors établissement.');
    if (!activePedagogyDocument(classSnap.data()!) || yearSnap.data()?.status !== 'active') throw new functions.https.HttpsError('failed-precondition', 'Classe ou année inactive.');
    if (raw.expectedVersion !== (current.data()?.version || 0)) throw new functions.https.HttpsError('aborted', 'Politique modifiée : rechargez.');
    const version = (current.data()?.version || 0) + 1;
    let policy;
    try { policy = parsePedagogyPolicy(raw.policy, classSnap.data()!, version); } catch (error) { throw new functions.https.HttpsError('invalid-argument', error instanceof Error ? error.message : 'Politique invalide.'); }
    const record = { id, schoolId, academicYearId, classId, policy, version, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid };
    transaction.set(ref, record);
    transaction.create(ref.collection('versions').doc(String(version)), record);
    audit(transaction, actor, schoolId, 'pedagogy_class_policy_saved', 'pedagogyClassPolicy', id, { version, stage: policy.stage, assessmentMode: policy.assessmentMode });
    return { policyId: id, version };
  });
});
