import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { initializeFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const projectId = 'ecoscolaire-staging', schoolId = 'pedagogy-watch-validation-20260908';
const trialId = 'source-watch-validation-20260908', uid = 'synthetic-watch-director-20260908';
const sourceUrl = 'https://raw.githubusercontent.com/Lililinda86/Ecoscolaire/staging/tests/fixtures/pedagogy-watch-source.txt';
const confirmation = process.env.PEDAGOGY_WATCH_CONFIRMATION;
assert.ok(['RUN_PEDAGOGY_STAGING_WATCH_BASELINE', 'RUN_PEDAGOGY_STAGING_WATCH_CHANGE'].includes(confirmation));
assert.equal(process.env.GITHUB_REPOSITORY, 'Lililinda86/Ecoscolaire');
assert.equal(process.env.GITHUB_REF, 'refs/heads/staging');
assert.equal(process.env.EXPECTED_STAGING_SHA, process.env.GITHUB_SHA);
assert.match(process.env.GITHUB_SHA || '', /^[a-f0-9]{40}$/);
assert.equal(process.env.PEDAGOGY_FIREBASE_PROJECT_ID, projectId);
assert.ok(!process.env.FIRESTORE_EMULATOR_HOST && !process.env.FIREBASE_AUTH_EMULATOR_HOST);
assert.ok(process.env.STAGING_FIREBASE_API_KEY);
const expectedHash = createHash('sha256').update(await readFile(new URL('../tests/fixtures/pedagogy-watch-source.txt', import.meta.url))).digest('hex');
const app = initializeApp({ projectId }, 'synthetic-source-watch');
const db = initializeFirestore(app, { preferRest: true }), auth = getAuth(app);
const manifest = db.collection('pedagogySourceWatchTrialManifests').doc(trialId);
const school = db.collection('schools').doc(schoolId), user = db.collection('users').doc(uid);
const watch = db.collection('pedagogySourceWatches').doc(schoolId + '--1');
const phase = confirmation.endsWith('_BASELINE') ? 'baseline' : 'change';
let ownsUser = false, ownsManifest = false, failure = null;
const report = { sha: process.env.GITHUB_SHA, runId: process.env.GITHUB_RUN_ID, phase, expectedHash, providerCalls: 0, fixtureSchool: schoolId, cleanup: 'pending' };
try {
  const previous = await manifest.get();
  if (phase === 'baseline') {
    assert.ok(!previous.exists && !(await school.get()).exists && !(await watch.get()).exists, 'WATCH_TRIAL_EXISTS_NO_AUTOMATIC_REPLAY');
    await manifest.create({ trialId, schoolId, state: 'setting_up', initialSha: report.sha, createdAt: FieldValue.serverTimestamp() });
    ownsManifest = true;
    await school.create({ name: 'Synthetic document watch ONLY', syntheticTrial: trialId });
  } else {
    assert.equal(previous.data()?.state, 'baseline_completed', 'WATCH_BASELINE_REQUIRED');
    assert.equal(previous.data()?.schoolId, schoolId);
    assert.notEqual(previous.data()?.baselineHash, expectedHash, 'WATCH_SOURCE_MUST_REALLY_CHANGE');
    assert.equal((await school.get()).data()?.syntheticTrial, trialId);
    ownsManifest = true;
  }
  assert.ok(!(await user.get()).exists, 'WATCH_USER_RECORD_EXISTS');
  await auth.createUser({ uid, email: 'synthetic-watch-director-20260908@example.invalid', displayName: 'Synthetic watch director' }); ownsUser = true;
  await user.create({ schoolId, role: 'director', isActive: true, syntheticTrial: trialId });
  const token = await auth.createCustomToken(uid, { schoolId, role: 'director' });
  const signedResponse = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=' + encodeURIComponent(process.env.STAGING_FIREBASE_API_KEY), {
    method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, returnSecureToken: true }), signal: AbortSignal.timeout(30000),
  });
  assert.ok(signedResponse.ok, 'WATCH_SYNTHETIC_AUTH_FAILED');
  const signed = await signedResponse.json(); assert.ok(signed.idToken);
  const call = async (name, payload) => {
    const response = await fetch(`https://us-central1-${projectId}.cloudfunctions.net/${name}`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60000), headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + signed.idToken }, body: JSON.stringify({ data: { schoolId, ...payload } }) });
    assert.ok(response.ok, 'WATCH_CALLABLE_FAILED'); const body = await response.json(); assert.ok(body.result && !body.error, 'WATCH_CALLABLE_REJECTED'); return body.result;
  };
  assert.ok((await db.collection('pedagogySourceWatches').where('enabled', '==', true).limit(1).get()).empty, 'OTHER_SOURCE_WATCH_ENABLED');
  const before = (await watch.get()).data();
  if (phase === 'change') assert.equal(before?.fingerprint?.sha256, previous.data().baselineHash, 'WATCH_BASELINE_WAS_CHANGED');
  await call('savePedagogySourceWatch', { slot: 1, title: 'Synthetic controlled public source', url: sourceUrl, intervalMinutes: 15, enabled: true, expectedVersion: before?.version || 0 });
  try { await execute('gcloud', ['scheduler', 'jobs', 'run', 'firebase-schedule-pedagogySourceWatchScheduler-us-central1', '--project', projectId, '--location', 'us-central1'], { timeout: 30000, maxBuffer: 10000 }); }
  catch { throw new Error('WATCH_SCHEDULER_TRIGGER_FAILED'); }
  const deadline = Date.now() + 120000;
  let result;
  do {
    result = (await watch.get()).data();
    if (result?.status === 'failed') throw new Error('WATCH_SOURCE_FETCH_FAILED');
    if (result?.fingerprint?.sha256 === expectedHash) break;
    await new Promise(resolve => setTimeout(resolve, 3000));
  } while (Date.now() < deadline);
  assert.equal(result.fingerprint?.sha256, expectedHash, 'WATCH_HASH_NOT_OBSERVED');
  assert.equal(result.status, phase === 'baseline' ? 'baseline' : 'file_changed');
  assert.equal(Boolean(result.pendingReview), phase === 'change');
  const attempts = await db.collection('pedagogySourceWatchAttempts').where('schoolId', '==', schoolId).limit(11).get();
  assert.ok(attempts.size > 0 && attempts.size <= 10);
  report.attempts = attempts.docs.map(doc => { const value = doc.data(); assert.equal(value.publicationDecision, 'none'); return { id: doc.id, outcome: value.outcome, sha256: value.fingerprint?.sha256 || null, checkedAt: value.checkedAt?.toDate().toISOString() || null }; });
  if (phase === 'change') {
    await call('recordPedagogySourceWatchReview', { slot: 1, expectedVersion: result.version, expectedSha256: expectedHash, declarationReceived: true, note: 'Synthetic fixture file change reviewed by automated test only. No real document or pedagogical decision.' });
    assert.equal((await watch.get()).data().pendingReview, false);
    report.reviewIsSyntheticOnly = true;
  }
  report.status = 'PASS';
  await manifest.update({ state: phase === 'baseline' ? 'baseline_completed' : 'change_completed', ...(phase === 'baseline' ? { baselineHash: expectedHash } : { changedHash: expectedHash }), [phase + 'Report']: report, updatedAt: FieldValue.serverTimestamp() });
} catch (error) {
  failure = error instanceof Error && /^[A-Z_0-9]+$/.test(error.message) ? error.message : 'WATCH_TRIAL_REQUIRES_DIAGNOSIS';
  report.status = 'FAIL'; report.errorCode = failure;
} finally {
  if (ownsManifest) {
    try { const current = await watch.get(); if (current.exists) { assert.equal(current.data().schoolId, schoolId); await watch.update({ enabled: false }); } }
    catch { failure ||= 'WATCH_DISABLE_FAILED'; }
    if (phase === 'change' && !failure) {
      try {
        for (const nested of ['versions', 'reviews']) {
          const entries = await watch.collection(nested).limit(21).get(); assert.ok(entries.size <= 20);
          for (const entry of entries.docs) { assert.equal(entry.data().schoolId, schoolId); await entry.ref.delete({ lastUpdateTime: entry.updateTime }); }
        }
        for (const collection of ['pedagogySourceWatchAttempts', 'audit_logs']) {
          const entries = await db.collection(collection).where('schoolId', '==', schoolId).limit(101).get(); assert.ok(entries.size <= 100);
          for (const entry of entries.docs) await entry.ref.delete({ lastUpdateTime: entry.updateTime });
        }
        const current = await watch.get(); await watch.delete({ lastUpdateTime: current.updateTime });
        const currentSchool = await school.get(); assert.equal(currentSchool.data().syntheticTrial, trialId); await school.delete({ lastUpdateTime: currentSchool.updateTime });
        assert.ok(!(await school.get()).exists && !(await watch.get()).exists);
      } catch { failure ||= 'WATCH_FIXTURE_CLEANUP_FAILED'; }
    }
  }
  if (ownsUser) {
    try { const value = await user.get(); if (value.exists) { assert.equal(value.data().syntheticTrial, trialId); await user.delete({ lastUpdateTime: value.updateTime }); } await auth.deleteUser(uid); }
    catch { failure ||= 'WATCH_AUTH_CLEANUP_FAILED'; }
  }
  report.cleanup = failure ? 'REVIEW_REQUIRED' : phase === 'baseline' ? 'USER_REMOVED_SOURCE_DISABLED_AWAITING_CHANGE' : 'EXACT_FIXTURES_REMOVED_MANIFEST_RETAINED';
  if (failure) { report.status = 'FAIL'; report.errorCode = failure; process.exitCode = 1; }
  if (ownsManifest) await manifest.update({ lastReport: report, ...(failure ? { state: 'failed_review_required' } : {}), updatedAt: FieldValue.serverTimestamp() });
  console.log(JSON.stringify(report)); await deleteApp(app);
}
