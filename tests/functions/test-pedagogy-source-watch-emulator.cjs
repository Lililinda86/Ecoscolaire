const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Firestore emulator required');
process.env.FUNCTIONS_EMULATOR = 'true';
process.env.GCLOUD_PROJECT = 'demo-ecoscolaire';
const admin = require('../../functions/node_modules/firebase-admin');
admin.initializeApp({ projectId: 'demo-ecoscolaire' });
const { savePedagogySourceWatch, recordPedagogySourceWatchReview, runPedagogySourceWatch } = require('../../functions/lib/pedagogy/sourceWatch');
const db = admin.firestore(), prefix = 'watch-' + randomBytes(8).toString('hex');
const schoolId = prefix, configId = schoolId + '--1';
const context = role => ({ auth: { uid: prefix + '-' + role, token: {} } });
let body = 'synthetic baseline', fetches = 0;
global.fetch = async () => { fetches++; return new Response(body, { headers: { 'content-type': 'text/plain' } }); };
(async () => {
  try {
    await db.doc('schools/' + schoolId).create({ name: 'Synthetic watch emulator' });
    for (const role of ['director', 'secretary', 'boardViewer']) await db.doc('users/' + prefix + '-' + role).create({ schoolId, role, isActive: true });
    const input = { schoolId, slot: 1, title: 'Synthetic source', url: 'https://www.minedub.cm/', intervalMinutes: 360, enabled: true, expectedVersion: 0 };
    for (const role of ['secretary', 'boardViewer']) await assert.rejects(savePedagogySourceWatch.run(input, context(role)), error => error.code === 'permission-denied');
    await assert.rejects(savePedagogySourceWatch.run({ ...input, url: 'http://127.0.0.1/' }, context('director')), error => error.code === 'invalid-argument');
    await savePedagogySourceWatch.run(input, context('director'));
    await assert.rejects(savePedagogySourceWatch.run(input, context('director')), error => error.code === 'aborted');
    const now = Date.now() + 1000;
    const parallel = await Promise.all([runPedagogySourceWatch(now), runPedagogySourceWatch(now)]);
    assert.equal(parallel.reduce((sum, result) => sum + result.checked, 0), 1);
    assert.equal(fetches, 1);
    const ref = db.doc('pedagogySourceWatches/' + configId);
    assert.equal((await ref.get()).data().status, 'baseline');
    body = 'synthetic changed content';
    await ref.update({ nextCheckAt: now });
    await runPedagogySourceWatch(now);
    const changed = (await ref.get()).data();
    assert.equal(changed.status, 'file_changed'); assert.equal(changed.pendingReview, true);
    const review = { schoolId, slot: 1, expectedVersion: changed.version, expectedSha256: changed.fingerprint.sha256, declarationReceived: true, note: 'Synthetic file review only; no curriculum approval.' };
    await assert.rejects(recordPedagogySourceWatchReview.run(review, context('secretary')), error => error.code === 'permission-denied');
    await assert.rejects(recordPedagogySourceWatchReview.run({ ...review, expectedSha256: 'a'.repeat(64) }, context('director')), error => error.code === 'aborted');
    await assert.rejects(recordPedagogySourceWatchReview.run({ ...review, declarationReceived: false }, context('director')), error => error.code === 'invalid-argument');
    await recordPedagogySourceWatchReview.run(review, context('director'));
    assert.equal((await ref.get()).data().pendingReview, false);
    assert.equal((await ref.get()).data().lastReview.publicationDecision, 'none');
    await assert.rejects(recordPedagogySourceWatchReview.run(review, context('director')), error => error.code === 'aborted');
    await ref.update({ nextCheckAt: now });
    global.fetch = async () => { throw new Error('simulated network failure'); };
    await runPedagogySourceWatch(now);
    const failed = (await ref.get()).data();
    assert.equal(failed.status, 'failed'); assert.equal(failed.lastError, 'SOURCE_UNAVAILABLE');
    assert.equal(failed.pendingReview, false); assert.equal(failed.fingerprint.sha256, changed.fingerprint.sha256);
    assert.equal(failed.lastSuccessAt.toMillis(), changed.lastSuccessAt.toMillis());
    const attempts = await db.collection('pedagogySourceWatchAttempts').where('schoolId', '==', schoolId).get();
    assert.equal(attempts.size, 3);
    attempts.docs.forEach(doc => { assert.equal(doc.data().publicationDecision, 'none'); assert.equal(doc.data().sourceAuthentication, 'not_established_by_watch'); });
    console.log('SOURCE_WATCH_EMULATOR_PASS: real Firestore transactions, simulated HTTP; not live scheduler proof');
  } finally {
    for (const collection of ['pedagogySourceWatches', 'pedagogySourceWatchAttempts', 'audit_logs']) {
      const docs = await db.collection(collection).where('schoolId', '==', schoolId).get();
      for (const doc of docs.docs) {
        if (collection === 'pedagogySourceWatches') for (const nested of ['versions', 'reviews']) for (const version of (await doc.ref.collection(nested).get()).docs) await version.ref.delete();
        await doc.ref.delete();
      }
    }
    for (const role of ['director', 'secretary', 'boardViewer']) await db.doc('users/' + prefix + '-' + role).delete();
    await db.doc('schools/' + schoolId).delete();
    await admin.app().delete();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
