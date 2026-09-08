import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { audit, requirePedagogyActor } from './authorization';
import { fingerprintPublicSource } from './sourceWatchFetch';
import { sourceWatchChange, sourceWatchInterval, sourceWatchUrl } from './sourceWatchPolicy';

const configs = 'pedagogySourceWatches', attempts = 'pedagogySourceWatchAttempts';
const synthetic = () => (admin.app().options.projectId || process.env.GCLOUD_PROJECT) === 'ecoscolaire-staging';
export const recordPedagogySourceWatchReview = functions.https.onCall(async (raw, context) => {
  const { actor, schoolId } = await requirePedagogyActor(context, raw?.schoolId, ['superAdmin', 'owner', 'director']);
  if (!Number.isInteger(raw?.slot) || raw.slot < 1 || raw.slot > 10 || raw.declarationReceived !== true ||
      typeof raw.note !== 'string' || !raw.note.trim() || raw.note.length > 1000 || !/^[a-f0-9]{64}$/.test(raw.expectedSha256 || '')) {
    throw new functions.https.HttpsError('invalid-argument', 'Examen reçu, note et empreinte du fichier requis.');
  }
  const db = admin.firestore(), ref = db.collection(configs).doc(schoolId + '--' + raw.slot);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref), current = snapshot.data();
    if (!current || current.schoolId !== schoolId) throw new functions.https.HttpsError('not-found', 'Veille introuvable.');
    if (current.version !== raw.expectedVersion || current.fingerprint?.sha256 !== raw.expectedSha256) throw new functions.https.HttpsError('aborted', 'La source a changé : rechargez avant de consigner son examen.');
    if (!current.pendingReview || current.status === 'failed') throw new functions.https.HttpsError('failed-precondition', 'Changement en attente et dernier contrôle réussi requis.');
    const version = current.version + 1;
    const review = { schoolId, sourceWatchId: ref.id, configurationVersion: current.version, sha256: raw.expectedSha256,
      note: raw.note.trim(), recordedBy: actor.uid, recordedAt: FieldValue.serverTimestamp(), publicationDecision: 'none', sourceAuthentication: 'not_established_by_watch' };
    transaction.create(ref.collection('reviews').doc(String(version)), review);
    transaction.update(ref, { version, pendingReview: false, lastReview: review });
    audit(transaction, actor, schoolId, 'pedagogy_source_change_review_recorded', 'pedagogySourceWatch', ref.id, { version, sha256: raw.expectedSha256 });
    return { version };
  });
});
export const savePedagogySourceWatch = functions.https.onCall(async (raw, context) => {
  const { actor, schoolId } = await requirePedagogyActor(context, raw?.schoolId, ['superAdmin', 'owner', 'director']);
  if (!Number.isInteger(raw?.slot) || raw.slot < 1 || raw.slot > 10 || typeof raw.enabled !== 'boolean') throw new functions.https.HttpsError('invalid-argument', 'Dix emplacements de veille au maximum.');
  let url: string, intervalMinutes: number;
  try { url = sourceWatchUrl(raw.url, synthetic()); intervalMinutes = sourceWatchInterval(raw.intervalMinutes, synthetic()); }
  catch { throw new functions.https.HttpsError('invalid-argument', 'Source publique HTTPS autorisée et intervalle valide requis.'); }
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (!title || title.length > 150) throw new functions.https.HttpsError('invalid-argument', 'Titre requis (150 caractères maximum).');
  const db = admin.firestore(), ref = db.collection(configs).doc(schoolId + '--' + raw.slot);
  return db.runTransaction(async transaction => {
    const [school, existing] = await Promise.all([transaction.get(db.collection('schools').doc(schoolId)), transaction.get(ref)]);
    if (!school.exists) throw new functions.https.HttpsError('not-found', 'Établissement introuvable.');
    const previous = existing.data();
    if (raw.expectedVersion !== (previous?.version || 0)) throw new functions.https.HttpsError('aborted', 'La configuration a changé : rechargez.');
    const version = (previous?.version || 0) + 1;
    const changedUrl = previous?.url !== url;
    const record = { id: ref.id, schoolId, slot: raw.slot, title, url, intervalMinutes, enabled: raw.enabled, version,
      nextCheckAt: Date.now(), lease: null, leaseUntil: 0, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid,
      ...(changedUrl ? { fingerprint: null, status: 'not_checked', lastSuccessAt: null, pendingReview: false, lastError: null } : {}) };
    transaction.set(ref, record, { merge: true });
    transaction.create(ref.collection('versions').doc(String(version)), { ...record, sourceAuthentication: 'not_established_by_watch', publicationDecision: 'none' });
    audit(transaction, actor, schoolId, 'pedagogy_source_watch_saved', 'pedagogySourceWatch', ref.id, { version, enabled: raw.enabled, slot: raw.slot });
    return { id: ref.id, version };
  });
});

/** Each tick performs at most six bounded public GETs. No source body is retained,
 * no AI is invoked, and a changed fingerprint never publishes/adopts a curriculum. */
export async function runPedagogySourceWatch(now = Date.now()) {
  const db = admin.firestore();
  const due = await db.collection(configs).where('enabled', '==', true).where('nextCheckAt', '<=', now).orderBy('nextCheckAt').limit(6).get();
  let checked = 0;
  for (const candidate of due.docs) {
    const lease = randomUUID();
    const claimed = await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(candidate.ref), current = snapshot.data();
      if (!current || current.enabled !== true || current.nextCheckAt > now || current.leaseUntil > now) return null;
      const school = await transaction.get(db.collection('schools').doc(current.schoolId));
      if (!school.exists) { transaction.update(candidate.ref, { enabled: false, lastError: 'SOURCE_SCHOOL_MISSING' }); return null; }
      transaction.update(candidate.ref, { lease, leaseUntil: now + 240000, nextCheckAt: now + 240000, lastAttemptAt: FieldValue.serverTimestamp() });
      return current;
    });
    if (!claimed) continue;
    checked++;
    let fingerprint = null, errorCode: string | null = null;
    let outcome: ReturnType<typeof sourceWatchChange> | 'failed' = 'failed';
    try {
      fingerprint = await fingerprintPublicSource(claimed.url, synthetic());
      outcome = sourceWatchChange(claimed.fingerprint?.sha256 || null, fingerprint.sha256);
    } catch (error) {
      fingerprint = null;
      errorCode = error instanceof Error && /^SOURCE_[A-Z0-9_]+$/.test(error.message) ? error.message : 'SOURCE_UNAVAILABLE';
    }
    await db.runTransaction(async transaction => {
      const fresh = await transaction.get(candidate.ref);
      const current = fresh.data();
      const applicable = current?.lease === lease && current?.version === claimed.version && current?.enabled === true;
      transaction.create(db.collection(attempts).doc(lease), {
        id: lease, schoolId: claimed.schoolId, sourceWatchId: candidate.id, configurationVersion: claimed.version,
        outcome, errorCode, fingerprint, previousSha256: claimed.fingerprint?.sha256 || null,
        appliedToCurrentConfiguration: applicable, checkedAt: FieldValue.serverTimestamp(),
        sourceAuthentication: 'not_established_by_watch', publicationDecision: 'none',
      });
      if (!applicable) return;
      let interval: number;
      try { interval = sourceWatchInterval(claimed.intervalMinutes, synthetic()); } catch { interval = 1440; }
      transaction.update(candidate.ref, {
        status: outcome, lastError: errorCode, lease: null, leaseUntil: 0, nextCheckAt: now + interval * 60000,
        lastAttemptAt: FieldValue.serverTimestamp(),
        ...(fingerprint ? { fingerprint, lastSuccessAt: FieldValue.serverTimestamp() } : {}),
        ...(outcome === 'file_changed' ? { pendingReview: true, changeDetectedAt: FieldValue.serverTimestamp() } : {}),
      });
    });
  }
  return { checked };
}
export const pedagogySourceWatchScheduler = functions.runWith({ timeoutSeconds: 180, memory: '256MB' })
  .pubsub.schedule('every 15 minutes').timeZone('Africa/Douala').onRun(async () => {
    const result = await runPedagogySourceWatch();
    console.log('PEDAGOGY_SOURCE_WATCH_TICK', { checked: result.checked });
    return null;
  });
