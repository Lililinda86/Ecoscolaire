import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { initializeFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { revalidationAssessmentLessons } = require('../functions/lib/pedagogy/approvedSyntheticRequests.js');
const { AI_REVALIDATION_ID, AI_REVALIDATION_CONFIRMATION, PEDAGOGY_SYNTHETIC_TRIAL_ID } = require('../functions/lib/pedagogy/aiSyntheticTrial.js');
const { assessmentMechanicalIssues } = require('../functions/lib/pedagogy/assessmentMechanicalQuality.js');
const projectId = 'ecoscolaire-staging', schoolId = 'pedagogy-ai-validation-20260906';
const uid = 'pedagogy-revalidation-secretary-20260908', yearId = 'pedagogy-revalidation-year-20260908', weekId = 'pedagogy-revalidation-week-20260908';
const checksum = (uploadId, review) => createHash('sha256').update(JSON.stringify({ uploadId, review: ['lessonTitle', 'objective', 'prerequisites', 'materials', 'lessonSteps', 'assessment', 'differentiation'].map(field => [field, review[field] || null]) })).digest('hex');
if (process.argv.includes('--check-only')) {
  assert.equal(revalidationAssessmentLessons.length, 2);
  console.log('TWO_SYNTHETIC_ASSESSMENTS_PINNED; PROVIDER_CALLS=0');
} else {
  assert.equal(process.env.GITHUB_REPOSITORY, 'Lililinda86/Ecoscolaire');
  assert.equal(process.env.GITHUB_REF, 'refs/heads/staging');
  assert.match(process.env.GITHUB_SHA || '', /^[a-f0-9]{40}$/);
  assert.equal(process.env.EXPECTED_STAGING_SHA, process.env.GITHUB_SHA);
  assert.equal(process.env.PEDAGOGY_FIREBASE_PROJECT_ID, projectId);
  assert.equal(process.env.PEDAGOGY_AI_TRIAL_CONFIRMATION, AI_REVALIDATION_CONFIRMATION);
  assert.ok(!process.env.FIRESTORE_EMULATOR_HOST && !process.env.FIREBASE_AUTH_EMULATOR_HOST);
  assert.ok(process.env.STAGING_FIREBASE_API_KEY);
  const app = initializeApp({ projectId }, 'pedagogy-two-assessments');
  const db = initializeFirestore(app, { preferRest: true }), auth = getAuth(app);
  const manifest = db.collection('pedagogyAiTrialManifests').doc(AI_REVALIDATION_ID);
  const ledger = db.collection('pedagogyAiBudgets').doc(PEDAGOGY_SYNTHETIC_TRIAL_ID);
  const config = db.collection('pedagogyAiConfigurations').doc(schoolId);
  const exact = [];
  let claimed = false, userOwned = false, fixturesAttempted = false, failed = null;
  let previousOperationIds = new Set();
  const report = { sha: process.env.GITHUB_SHA, runId: process.env.GITHUB_RUN_ID, model: 'gpt-4.1-mini-2025-04-14', retryCount: 0, providerCalls: 0, inputTokens: 0, outputTokens: 0, estimatedCostMicros: 0, assessments: [], validationFailures: [], cleanupIssues: [], humanApproval: 'NOT_PERFORMED', costBasis: 'observed_tokens_uncached_list_price_upper_bound_not_invoice', storageCreated: 0 };
  try {
    const oldOperations = await db.collection('pedagogyAiOperations').where('schoolId', '==', schoolId).limit(20).get();
    assert.equal(oldOperations.size, 10, 'PRIOR_OPERATIONS_CHANGED');
    assert.ok(oldOperations.docs.every(doc => doc.data().status === 'succeeded'), 'PRIOR_CONSUMPTION_UNCERTAIN');
    previousOperationIds = new Set(oldOperations.docs.map(doc => doc.id));
    await db.runTransaction(async tx => {
      const [prior, budget, current, root, friday, existing] = await Promise.all([
        tx.get(db.collection('pedagogyAiTrialManifests').doc(PEDAGOGY_SYNTHETIC_TRIAL_ID)), tx.get(ledger), tx.get(config),
        tx.get(db.collection('schools').doc(schoolId)), tx.get(db.collection('pedagogyFridayConfigurations').doc(schoolId)), tx.get(manifest),
      ]);
      assert.ok(!existing.exists && !root.exists, 'REVALIDATION_ALREADY_EXISTS_OR_FIXTURES_REMAIN');
      assert.equal(prior.data()?.report?.cleanupVerified, true);
      assert.equal(prior.data()?.report?.unresolvedConsumption, false);
      assert.equal(budget.data()?.preparationCalls, 5);
      assert.equal(budget.data()?.assessmentCalls, 5);
      assert.equal(budget.data()?.reservedMicros, 496062);
      assert.equal(current.data()?.enabled, false);
      assert.equal(current.data()?.version, 1);
      assert.equal(current.data()?.model, report.model);
      assert.equal(friday.data()?.enabled, false);
      tx.create(manifest, { schoolId, sha: report.sha, runId: report.runId, state: 'setting_up', additionalAssessmentLimit: 2, priorAssessmentCalls: 5, priorPreparationCalls: 5, configurationVersion: 2, priorReservedMicros: budget.data().reservedMicros, fixtureOnly: true, createdAt: FieldValue.serverTimestamp() });
    });
    claimed = true;
    await auth.createUser({ uid, email: 'pedagogy-revalidation-20260908@example.invalid', displayName: 'Synthetic revalidation secretary' });
    userOwned = true;
    const batch = db.batch();
    const create = (collection, id, data) => { const ref = db.collection(collection).doc(id); exact.push(ref); batch.create(ref, { id, schoolId, ...data, syntheticTrial: AI_REVALIDATION_ID }); };
    create('users', uid, { role: 'secretary', isActive: true, name: 'Synthetic revalidation secretary' });
    create('schools', schoolId, { name: 'Synthetic revalidation only', isActive: true, activeAcademicYearId: yearId });
    create('academicYears', yearId, { name: 'Synthetic year', startDate: '2026-01-01', endDate: '2026-12-31', status: 'active' });
    create('teachingWeeks', weekId, { academicYearId: yearId, weekStartDate: '2026-09-07', weekEndDate: '2026-09-13', status: 'open' });
    for (const [index, [language, cycle, title, content]] of revalidationAssessmentLessons.entries()) {
      const classId = 'pedagogy-revalidation-class-' + index, uploadId = 'synthetic-revalidation-text-' + index;
      const reviewData = { lessonTitle: title, objective: content, lessonSteps: content };
      create('classes', classId, { name: 'Synthetic ' + cycle + ' ' + language, cycle, type: language === 'en' ? 'anglophone' : 'francophone', section: language === 'en' ? 'anglophone' : 'francophone', isActive: true });
      create('lessonPreparations', 'pedagogy-revalidation-lesson-' + index, { academicYearId: yearId, classId, weekId, subjectId: 'synthetic-math', classSubjectId: classId + '-math', subjectName: language === 'en' ? 'Mathematics' : 'Mathematiques', version: 1, status: 'validated', currentUploadId: uploadId, reviewData,
        teachingConfirmation: { id: 'synthetic-revalidation-declaration-' + index, status: 'taught', effectiveDate: '2026-09-08', declaredByTeacherStaffId: 'synthetic-teacher-not-a-person', recordedBy: uid, reviewChecksum: checksum(uploadId, reviewData), excerpts: [], note: 'Synthetic test only; not an actual teacher decision.' } });
    }
    await manifest.update({ exactPaths: exact.map(ref => ref.path), userId: uid });
    fixturesAttempted = true;
    await batch.commit();
    await db.runTransaction(async tx => {
      const [current, budget, claim] = await Promise.all([tx.get(config), tx.get(ledger), tx.get(manifest)]);
      assert.equal(current.data()?.enabled, false); assert.equal(current.data()?.version, 1);
      assert.equal(budget.data()?.assessmentCalls, 5); assert.equal(budget.data()?.preparationCalls, 5);
      assert.equal(claim.data()?.state, 'setting_up'); assert.equal(claim.data()?.runId, report.runId);
      tx.update(config, { enabled: true, version: 2, dailyCallLimit: 12, approvalReference: 'Explicit user authorization: exactly two additional synthetic assessments; cumulative USD2 unchanged', revalidationId: AI_REVALIDATION_ID });
      tx.update(manifest, { state: 'running', startedAt: FieldValue.serverTimestamp() });
    });
    const customToken = await auth.createCustomToken(uid, { schoolId, role: 'secretary' });
    const signIn = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=' + encodeURIComponent(process.env.STAGING_FIREBASE_API_KEY), { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: customToken, returnSecureToken: true }), signal: AbortSignal.timeout(30000) });
    assert.ok(signIn.ok, 'SYNTHETIC_AUTH_FAILED');
    const signed = await signIn.json(); assert.ok(signed.idToken, 'SYNTHETIC_AUTH_FAILED');
    for (let index = 0; index < 2; index++) {
      const started = performance.now();
      const response = await fetch('https://us-central1-ecoscolaire-staging.cloudfunctions.net/generateWeeklyAssessment', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(180000), headers: { Authorization: 'Bearer ' + signed.idToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { schoolId, academicYearId: yearId, classId: 'pedagogy-revalidation-class-' + index, weekId } }) });
      assert.ok(response.ok, 'STAGING_CALLABLE_FAILED');
      const body = await response.json();
      assert.equal(body.result?.status, 'needs_review', 'GENERATION_FAILED_NO_PAID_RETRY');
      const assessment = (await db.collection('weeklyAssessments').doc(body.result.assessmentId).get()).data();
      const items = await db.collection('assessmentItems').where('schoolId', '==', schoolId).where('weeklyAssessmentId', '==', body.result.assessmentId).get();
      const values = items.docs.map(doc => doc.data()).sort((a, b) => a.order - b.order);
      const issues = assessmentMechanicalIssues(values);
      for (const type of ['multiple_choice', 'short_answer', 'exercise']) if (!values.some(item => item.questionType === type)) issues.push('QUESTION_TYPE_MISSING:' + type);
      if (values.reduce((sum, item) => sum + item.points, 0) !== 20) issues.push('POINTS_TOTAL_INVALID');
      assert.equal(assessment.teacherValidated, false);
      assert.equal(assessment.generatorProvider, 'openai');
      report.validationFailures.push(...issues.map(issue => index + ':' + issue));
      report.assessments.push({ index, assessmentId: body.result.assessmentId, operationId: assessment.aiOperationId, callableLatencyMs: Math.round(performance.now() - started), issues, source: revalidationAssessmentLessons[index], items: values.map(({ order, questionType, questionText, instructions, choices, correctAnswer, expectedAnswer, correctionGuide, points }) => ({ order, questionType, questionText, instructions, choices, correctAnswer, expectedAnswer, correctionGuide, points })), status: 'needs_review', semanticReview: 'REQUIRED' });
      console.log('SYNTHETIC_ASSESSMENT_COMPLETED=' + (index + 1));
    }
    if (report.validationFailures.length) failed = 'MECHANICAL_QUALITY_REVIEW_REQUIRED';
  } catch (error) {
    failed = error instanceof Error && /^[A-Z_0-9: -]{1,180}$/.test(error.message) ? error.message : 'REVALIDATION_FAILED_REQUIRES_DIAGNOSIS';
  } finally {
    if (claimed) {
      try { await config.update({ enabled: false, disabledReason: 'REVALIDATION_FINISHED_OR_FAILED', disabledAt: FieldValue.serverTimestamp() }); } catch { report.cleanupIssues.push('CONFIG_DISABLE_FAILED'); }
      try {
        const operations = await db.collection('pedagogyAiOperations').where('schoolId', '==', schoolId).limit(20).get();
        const fresh = operations.docs.filter(doc => !previousOperationIds.has(doc.id)).map(doc => ({ id: doc.id, ...doc.data() }));
        report.providerCalls = fresh.length;
        report.unresolvedConsumption = fresh.some(op => op.status !== 'succeeded');
        report.operations = fresh.map(op => ({ id: op.id, status: op.status, result: op.result || null, reservedMicros: op.reservedMicros }));
        for (const op of fresh) { report.inputTokens += op.result?.inputTokens || 0; report.outputTokens += op.result?.outputTokens || 0; report.estimatedCostMicros += op.result?.estimatedCostMicros || 0; }
        report.cumulativeLedger = (await ledger.get()).data();
        assert.ok(fresh.length <= 2 && report.cumulativeLedger.assessmentCalls <= 7 && report.cumulativeLedger.preparationCalls === 5, 'ALLOWANCE_VIOLATION');
      } catch { report.cleanupIssues.push('CONSUMPTION_VERIFICATION_FAILED'); }
      if (fixturesAttempted) {
        try {
          const generatedRefs = [];
          for (const collection of ['assessmentItems', 'weeklyAssessments', 'pedagogyAuditLogs', 'audit_logs']) {
            const snapshot = await db.collection(collection).where('schoolId', '==', schoolId).limit(200).get();
            assert.ok(snapshot.size < 200, 'CLEANUP_SCOPE_OVERFLOW');
            for (const doc of snapshot.docs) {
              if (collection === 'weeklyAssessments') {
                assert.equal(doc.data().academicYearId, yearId);
                for (const sub of ['revisions', 'contentRevisions']) {
                  const nested = await doc.ref.collection(sub).limit(20).get(); assert.ok(nested.size < 20);
                  generatedRefs.push(...nested.docs.map(row => row.ref));
                }
              } else if (collection === 'assessmentItems') assert.equal(doc.data().academicYearId, yearId);
              else assert.ok(doc.data().actorUid === uid || doc.data().actorId === uid || doc.data().recordedBy === uid, 'UNOWNED_AUDIT_FIXTURE');
              generatedRefs.push(doc.ref);
            }
          }
          const roots = await db.getAll(...exact);
          for (const root of roots) if (root.exists) assert.equal(root.data().syntheticTrial, AI_REVALIDATION_ID, 'UNOWNED_ROOT_FIXTURE');
          const refs = [...generatedRefs, ...roots.filter(root => root.exists).map(root => root.ref)];
          const cleanup = db.batch(); refs.forEach(ref => cleanup.delete(ref)); await cleanup.commit();
          if (refs.length) {
            let verified = false;
            for (let attempt = 0; attempt < 3; attempt++) {
              try { assert.ok((await db.getAll(...refs)).every(doc => !doc.exists)); verified = true; break; }
              catch { if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1))); }
            }
            assert.ok(verified, 'CLEANUP_READBACK_FAILED');
          }
          report.removedFixtureDocuments = refs.length;
        } catch { report.cleanupIssues.push('EXACT_FIRESTORE_CLEANUP_FAILED'); }
      }
      if (userOwned) {
        try {
          await auth.deleteUser(uid);
          try { await auth.getUser(uid); throw new Error('AUTH_RESIDUE'); } catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
        } catch { report.cleanupIssues.push('AUTH_CLEANUP_FAILED'); }
      }
      report.cleanupVerified = fixturesAttempted && report.cleanupIssues.length === 0;
      if (report.cleanupIssues.length) failed ||= 'CLEANUP_OR_USAGE_VERIFICATION_FAILED';
      report.status = failed ? 'FAILED' : 'MECHANICAL_PASS_SEMANTIC_REVIEW_REQUIRED';
      report.errorCode = failed;
      report.openAiCallsStopped = (await config.get()).data()?.enabled === false;
      await manifest.update({ state: failed ? 'failed_review_required' : 'completed', report, finishedAt: FieldValue.serverTimestamp() });
    }
    console.log(JSON.stringify({ status: report.status || 'NOT_STARTED', errorCode: failed, providerCalls: report.providerCalls, cleanupVerified: report.cleanupVerified || false, inputTokens: report.inputTokens, outputTokens: report.outputTokens, estimatedCostMicros: report.estimatedCostMicros, retryCount: 0, openAiCallsStopped: report.openAiCallsStopped || false }));
    await deleteApp(app);
    if (failed) process.exitCode = 1;
  }
}
