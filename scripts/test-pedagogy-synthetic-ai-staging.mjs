import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const executeFile = promisify(execFile);
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { initializeFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { getStorage } = require('firebase-admin/storage');
const { assertApprovedSyntheticDocument } = require('../functions/lib/pedagogy/approvedSyntheticDocuments.js');
const { approvedAssessmentLessons } = require('../functions/lib/pedagogy/approvedSyntheticRequests.js');
const { AI_CONTINUATION_CONFIRMATION, AI_PRIOR_OPERATION_IDS, assertDiagnosedAiContinuation } = require('../functions/lib/pedagogy/aiTrialContinuation.js');
const schoolId = 'pedagogy-ai-validation-20260906';
const trialId = 'synthetic-validation-2026-09-06';
const projectId = 'ecoscolaire-staging';
const bucketName = 'ecoscolaire-staging.firebasestorage.app';
const uid = 'pedagogy-ai-trial-secretary-20260906';
const yearId = 'pedagogy-ai-trial-year-20260906';
const weekId = 'pedagogy-ai-trial-week-20260906';
const documents = [
  ['pre-fr.pdf', 'application/pdf', 'trier'],
  ['nursery-en.pdf', 'application/pdf', 'sound'],
  ['primary-fr.pdf', 'application/pdf', 'addition'],
  ['primary-en.png', 'image/png', 'group'],
  ['college-en.png', 'image/png', 'fraction'],
];
const extractionAnchors = [
  [/rouge/i, /bleu/i],
  [/moon/i, /mouse/i],
  [/trois|3/i, /sept|7/i],
  [/twelve|12/i, /four|4/i],
  [/half|1\/2/i, /quarter|1\/4|2\/4/i],
];
const lessons = [
  ['fr', 'primary', 'Addition', 'Former trois jetons et quatre jetons. Les reunir donne sept. Trois plus quatre vaut sept. Deux plus cinq vaut sept.'],
  ['en', 'primary', 'Equal groups', 'Share twelve counters into three equal groups. Each group has four counters. Twelve divided by three equals four.'],
  ['fr', 'secondary', 'Fractions equivalentes', 'Une moitie vaut deux quarts. Multiplier le numerateur et le denominateur par deux conserve la valeur.'],
  ['en', 'secondary', 'Equivalent fractions', 'One half equals two quarters. Multiplying numerator and denominator by two preserves the value.'],
  ['fr', 'primary', 'Comparer des nombres', 'Sept est plus grand que cinq. Cinq est plus petit que sept. Sept est egal a sept.'],
];
const hash = value => createHash('sha256').update(value).digest('hex');
assert.deepEqual(lessons, approvedAssessmentLessons, 'SYNTHETIC_LESSON_ALLOWLIST_MISMATCH');
const reviewChecksum = (uploadId, review) => hash(JSON.stringify({ uploadId, review: ['lessonTitle', 'objective', 'prerequisites', 'materials', 'lessonSteps', 'assessment', 'differentiation'].map(field => [field, review[field] || null]) }));
const safeError = error => error instanceof Error && /^[A-Z_0-9: -]{1,180}$/.test(error.message) ? error.message : 'TRIAL_FAILED_REQUIRES_DIAGNOSIS';
const files = await Promise.all(documents.map(async ([name, mimeType, keyword], index) => {
  const bytes = await readFile(new URL('../tests/fixtures/synthetic-pedagogy-ai/' + name, import.meta.url));
  assertApprovedSyntheticDocument(bytes, mimeType);
  return { name, mimeType, keyword, bytes, checksum: hash(bytes), preparationId: `pedagogy-ai-trial-document-${index}`, uploadId: `pedagogy-ai-trial-upload-${index}`,
    storagePath: `schools/${schoolId}/pedagogy/preparations/${yearId}/trial-${index}/original.${name.split('.').pop()}` };
}));
if (process.argv.includes('--check-only')) {
  console.log(JSON.stringify({ fixtureHashesVerified: files.length, assessmentFixtures: lessons.length, providerCalls: 0 }));
} else {
  assert.equal(process.env.GITHUB_REPOSITORY, 'Lililinda86/Ecoscolaire');
  assert.equal(process.env.GITHUB_REF, 'refs/heads/staging');
  assert.match(process.env.GITHUB_SHA || '', /^[a-f0-9]{40}$/);
  assert.equal(process.env.EXPECTED_STAGING_SHA, process.env.GITHUB_SHA);
  assert.equal(process.env.PEDAGOGY_FIREBASE_PROJECT_ID, projectId);
  const continuation = process.env.PEDAGOGY_AI_TRIAL_CONFIRMATION === AI_CONTINUATION_CONFIRMATION;
  assert.ok(continuation || process.env.PEDAGOGY_AI_TRIAL_CONFIRMATION === 'RUN_PEDAGOGY_STAGING_AI_USD2');
  assert.ok(!process.env.FIRESTORE_EMULATOR_HOST && !process.env.FIREBASE_AUTH_EMULATOR_HOST);
  assert.ok(process.env.STAGING_FIREBASE_API_KEY, 'FIREBASE_CLIENT_CONFIGURATION_REQUIRED');
  const app = initializeApp({ projectId, storageBucket: bucketName }, 'pedagogy-synthetic-ai-trial');
  const db = initializeFirestore(app, { preferRest: true }), auth = getAuth(app), bucket = getStorage(app).bucket();
  const manifestRef = db.collection('pedagogyAiTrialManifests').doc(trialId);
  const ledgerRef = db.collection('pedagogyAiBudgets').doc(trialId);
  const configRef = db.collection('pedagogyAiConfigurations').doc(schoolId);
  const fridayRef = db.collection('pedagogyFridayConfigurations').doc(schoolId);
  const exact = [], uploaded = [], cleanupIssues = [];
  let storageCreatedCount = 0;
  let ownsFixture = false, ownsUser = false, ownsFriday = false, manifestCreated = false, failure = null;
  const report = { sha: process.env.GITHUB_SHA, runId: process.env.GITHUB_RUN_ID, model: 'gpt-4.1-mini-2025-04-14', documentChecks: [], assessments: [], successfulProviderOperations: 0, estimatedCostMicros: 0, costBasis: 'observed_tokens_uncached_list_price_upper_bound_not_invoice', cleanupVerified: false, pedagogicalApproval: 'NOT_PERFORMED' };
  try {
    const initial = await Promise.all([manifestRef.get(), ledgerRef.get(), db.collection('schools').doc(schoolId).get(), configRef.get(), fridayRef.get()]);
    if (continuation) {
      assert.ok(!initial[2].exists && !initial[4].exists, 'CONTINUATION_FIXTURE_RESIDUE');
      const previous = await db.collection('pedagogyAiOperations').where('schoolId', '==', schoolId).limit(11).get();
      const operations = previous.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      assertDiagnosedAiContinuation(initial[0].data() || {}, initial[1].data() || {}, initial[3].data() || {}, operations);
      await db.runTransaction(async tx => {
        const [manifest, ledger, config] = await Promise.all([tx.get(manifestRef), tx.get(ledgerRef), tx.get(configRef)]);
        assertDiagnosedAiContinuation(manifest.data() || {}, ledger.data() || {}, config.data() || {}, operations);
        tx.update(manifestRef, { continuationClaimed: true, previousReport: manifest.data().report, continuationSha: report.sha, continuationRunId: report.runId, state: 'continuation_setting_up' });
      });
      report.continuationOf = '34185299765';
      // Read the two immutable paid results; never invoke their callables again.
      for (let index = 0; index < 2; index++) {
        const operation = operations.find(item => item.id === AI_PRIOR_OPERATION_IDS[index]);
        const result = operation.result.data;
        const title = String(result.lessonTitle || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        report.documentChecks.push({ file: files[index].name, sha256: files[index].checksum, operationId: operation.id, reusedPersistedResult: true,
          titleAnchorMatched: title.includes(files[index].keyword), contentAnchorsMatched: extractionAnchors[index].every(anchor => anchor.test(JSON.stringify(result))),
          draftOnly: true, incompleteFieldsChecked: false, syntheticExtractForReview: result });
      }
    } else {
      assert.ok(initial.every(snapshot => !snapshot.exists), 'TRIAL_ALREADY_EXISTS_NO_AUTOMATIC_REPLAY');
      await manifestRef.create({ schoolId, sha: report.sha, runId: report.runId, state: 'setting_up', createdAt: FieldValue.serverTimestamp(), fixtureOnly: true, userId: uid, storagePaths: files.map(file => file.storagePath) });
    }
    manifestCreated = true;
    await auth.createUser({ uid, email: 'pedagogy-ai-trial-20260906@example.invalid', displayName: 'Synthetic AI trial secretary' }); ownsUser = true;
    const batch = db.batch();
    const create = (collection, id, data) => { const ref = db.collection(collection).doc(id); exact.push(ref); batch.create(ref, { id, schoolId, ...data, syntheticTrial: trialId, createdAt: FieldValue.serverTimestamp() }); };
    create('users', uid, { role: 'secretary', isActive: true, name: 'Synthetic AI trial secretary' });
    create('schools', schoolId, { name: 'Synthetic AI trial ONLY', schoolCode: 'SYNTHETIC-AI-ONLY', isActive: true, activeAcademicYearId: yearId });
    create('academicYears', yearId, { name: 'Synthetic year', startDate: '2026-01-01', endDate: '2026-12-31', status: 'active' });
    create('teachingWeeks', weekId, { academicYearId: yearId, weekStartDate: '2026-08-31', weekEndDate: '2026-09-06', status: 'open' });
    for (const file of files) {
      create('lessonPreparations', file.preparationId, { academicYearId: yearId, classId: 'synthetic-document-only', weekId, currentUploadId: file.uploadId, version: 1, status: 'uploaded' });
      create('preparationUploads', file.uploadId, { preparationId: file.preparationId, storagePath: file.storagePath, size: file.bytes.length, checksum: file.checksum, mimeType: file.mimeType, originalFileName: file.name, status: 'uploaded' });
    }
    for (const [index, [language, cycle, title, content]] of lessons.entries()) {
      const classId = `pedagogy-ai-trial-class-${index}`, preparationId = `pedagogy-ai-trial-lesson-${index}`, uploadId = `synthetic-reviewed-text-${index}`;
      const reviewData = { lessonTitle: title, objective: content, lessonSteps: content };
      create('classes', classId, { name: `Synthetic ${cycle} ${language} ${index}`, cycle, type: language === 'en' ? 'anglophone' : 'francophone', section: language === 'en' ? 'anglophone' : 'francophone', isActive: true });
      create('lessonPreparations', preparationId, { academicYearId: yearId, classId, weekId, subjectId: 'synthetic-math', classSubjectId: classId + '-math', subjectName: language === 'en' ? 'Mathematics' : 'Mathematiques', version: 1, status: 'validated', currentUploadId: uploadId, reviewData,
        teachingConfirmation: { id: `synthetic-declaration-${index}`, status: 'taught', effectiveDate: '2026-09-01', declaredByTeacherStaffId: 'synthetic-teacher-not-a-person', recordedBy: uid, reviewChecksum: reviewChecksum(uploadId, reviewData), excerpts: [], note: 'Synthetic fixture only, NOT an actual teacher decision or taught course.' } });
    }
    if (!continuation) {
      batch.create(ledgerRef, { trialId, reservedMicros: 0, preparationCalls: 0, assessmentCalls: 0, createdAt: FieldValue.serverTimestamp() });
      batch.create(configRef, { enabled: true, provider: 'openai', model: report.model, version: 1, maxOutputTokens: 4000, maxInputBytes: 20000, dailyCallLimit: 10, dailyBudgetMicros: 2000000, inputPriceMicrosPerMillionTokens: 400000, outputPriceMicrosPerMillionTokens: 1600000, approvalReference: 'User authorization: five synthetic documents plus five assessments, USD2 total', privacyReviewReference: 'Pinned original synthetic fixtures only; no real records' });
    } else {
      batch.update(configRef, { enabled: true, continuationRunId: report.runId });
    }
    await batch.commit(); ownsFixture = true;
    await manifestRef.update({ state: 'fixture_ready', exactPaths: exact.map(ref => ref.path) });
    for (const file of files) {
      const object = bucket.file(file.storagePath);
      await object.save(file.bytes, { resumable: false, preconditionOpts: { ifGenerationMatch: 0 }, metadata: { contentType: file.mimeType, metadata: { checksum: file.checksum, preparationId: file.preparationId, syntheticTrial: trialId } } });
      storageCreatedCount++;
      const [metadata] = await object.getMetadata(); uploaded.push({ file: object, generation: metadata.generation });
    }
    const customToken = await auth.createCustomToken(uid, { schoolId, role: 'secretary' });
    const signIn = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=' + encodeURIComponent(process.env.STAGING_FIREBASE_API_KEY), { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: customToken, returnSecureToken: true }), signal: AbortSignal.timeout(30000) });
    assert.ok(signIn.ok, 'SYNTHETIC_AUTH_FAILED'); const signed = await signIn.json(); assert.ok(signed.idToken, 'SYNTHETIC_AUTH_TOKEN_MISSING');
    const call = async (name, data) => {
      const response = await fetch(`https://us-central1-${projectId}.cloudfunctions.net/${name}`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(180000), headers: { Authorization: `Bearer ${signed.idToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { schoolId, ...data } }) });
      assert.ok(response.ok, 'STAGING_CALLABLE_FAILED'); const body = await response.json(); assert.ok(!body.error && body.result, 'STAGING_CALLABLE_REJECTED'); return body.result;
    };
    await manifestRef.update({ state: 'running', startedAt: FieldValue.serverTimestamp() });
    for (const file of files.slice(continuation ? 2 : 0)) {
      const started = performance.now();
      const result = await call('startLessonPreparationAnalysis', { uploadId: file.uploadId });
      const callableLatencyMs = Math.round(performance.now() - started);
      if (result.analysisStatus !== 'succeeded') throw new Error('AI_DOCUMENT_FAILED: ' + (result.errorCode || 'UNKNOWN'));
      const analysis = (await db.collection('preparationAnalyses').doc(result.analysisId).get()).data();
      assert.equal(analysis.processingMode, 'synthetic_provider_attempt'); assert.equal(analysis.providerReceipt?.model, report.model);
      assert.equal(analysis.appliedToCurrentPreparation, true);
      const title = String(result.result?.lessonTitle || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const titleAnchorMatched = title.includes(file.keyword);
      const extracted = JSON.stringify(result.result);
      assert.ok(extractionAnchors[report.documentChecks.length].every(anchor => anchor.test(extracted)), 'SYNTHETIC_CONTENT_ANCHOR_FAILED');
      assert.equal((await db.collection('lessonPreparations').doc(file.preparationId).get()).data().status, 'needs_review');
      // This approved PDF deliberately serves as the incomplete-field case:
      // neither prerequisites nor differentiation appears in its native text.
      if (file.name === 'primary-fr.pdf') {
        assert.deepEqual(result.result.prerequisites, [], 'MISSING_PREREQUISITES_INVENTED');
        assert.equal(result.result.differentiation, null, 'MISSING_DIFFERENTIATION_INVENTED');
        assert.ok(result.result.warnings.length > 0, 'MISSING_FIELDS_NOT_SIGNALED');
      }
      report.documentChecks.push({ file: file.name, sha256: file.checksum, operationId: analysis.providerReceipt.operationId, titleAnchorMatched, contentAnchorsMatched: true, draftOnly: true, callableLatencyMs,
        incompleteFieldsChecked: file.name === 'primary-fr.pdf', syntheticExtractForReview: result.result });
      console.log(JSON.stringify({ phase: 'document', completed: report.documentChecks.length, provider: 'openai' }));
    }
    // Trigger the actual existing Cloud Scheduler job, never a mocked generator.
    // Refuse a global trigger if any other school's automation is enabled.
    assert.ok((await db.collection('pedagogyFridayConfigurations').where('enabled', '==', true).limit(1).get()).empty, 'OTHER_FRIDAY_CONFIGURATION_ENABLED');
    await fridayRef.create({ schoolId, academicYearId: yearId, enabled: true, localTime: '12:00', classIds: ['pedagogy-ai-trial-class-0'], version: 1, syntheticTrial: trialId, controlledTrialFriday: '2026-09-04T12:00:00Z', createdAt: FieldValue.serverTimestamp() });
    ownsFriday = true;
    const trigger = async () => {
      try { await executeFile('gcloud', ['scheduler', 'jobs', 'run', 'firebase-schedule-pedagogyFridayScheduler-us-central1', '--project', projectId, '--location', 'us-central1'], { timeout: 30000, maxBuffer: 10000 }); }
      catch { throw new Error('FRIDAY_CONTROLLED_TRIGGER_FAILED'); }
    };
    await Promise.all([trigger(), trigger()]);
    const fridayDeadline = Date.now() + 240000;
    let ticks, runs;
    do {
      ticks = await fridayRef.collection('trialTicks').limit(6).get();
      runs = await db.collection('pedagogyFridayRuns').where('schoolId', '==', schoolId).limit(2).get();
      if (runs.docs.some(doc => doc.data().status === 'retryable')) throw new Error('FRIDAY_GENERATION_REQUIRES_DIAGNOSIS');
      if (ticks.size >= 2 && runs.size === 1 && runs.docs[0].data().status === 'succeeded') break;
      await new Promise(resolve => setTimeout(resolve, 5000));
    } while (Date.now() < fridayDeadline);
    assert.ok(ticks.size >= 2, 'FRIDAY_DOUBLE_DELIVERY_NOT_OBSERVED');
    assert.equal(runs.size, 1, 'FRIDAY_RUN_COUNT_MISMATCH');
    assert.equal(runs.docs[0].data().status, 'succeeded', 'FRIDAY_RUN_NOT_SUCCESSFUL');
    assert.equal(runs.docs[0].data().attempts, 1, 'FRIDAY_DUPLICATE_GENERATION');
    assert.equal((await ledgerRef.get()).data().assessmentCalls, 1, 'FRIDAY_DUPLICATE_PROVIDER_RESERVATION');
    await fridayRef.update({ enabled: false, disabledAt: FieldValue.serverTimestamp() });
    report.fridayAutomation = { actualSchedulerTriggered: true, completedDeliveries: ticks.size, attempts: 1, controlledClock: '2026-09-04T12:00:00Z', generatedAssessmentId: runs.docs[0].data().assessmentId, noDuplicateProviderReservation: true };
    for (const [index, [language, cycle]] of lessons.entries()) {
      const started = performance.now();
      const result = await call('generateWeeklyAssessment', { academicYearId: yearId, classId: `pedagogy-ai-trial-class-${index}`, weekId });
      const callableLatencyMs = Math.round(performance.now() - started);
      if (result.status !== 'needs_review') throw new Error('AI_ASSESSMENT_FAILED: ' + (result.error || 'UNKNOWN'));
      if (index === 0) assert.equal(result.idempotent, true, 'MANUAL_REPLAY_DID_NOT_REUSE_FRIDAY_DRAFT');
      const assessment = (await db.collection('weeklyAssessments').doc(result.assessmentId).get()).data();
      assert.equal(assessment.generatorProvider, 'openai'); assert.equal(assessment.teacherValidated, false); assert.equal(assessment.totalPoints, 20); assert.ok(assessment.itemCount > 0);
      const items = await db.collection('assessmentItems').where('schoolId', '==', schoolId).where('weeklyAssessmentId', '==', result.assessmentId).limit(101).get();
      assert.equal(items.size, assessment.itemCount, 'ASSESSMENT_ITEM_COUNT_MISMATCH');
      assert.ok(items.size > 0 && items.size <= 100, 'ASSESSMENT_ITEM_BOUND_EXCEEDED');
      const syntheticQuestionsForReview = items.docs.map(doc => {
        const item = doc.data();
        assert.ok(item.questionText && item.expectedAnswer && item.correctionGuide, 'ASSESSMENT_CONTENT_MISSING');
        assert.deepEqual(item.sourceCurriculumUnitIds, [], 'UNVERIFIED_CURRICULUM_LINK');
        assert.deepEqual(item.sourceLessonPreparationIds, [`pedagogy-ai-trial-lesson-${index}`], 'UNCONFIRMED_ASSESSMENT_SOURCE');
        return { order: item.order, questionType: item.questionType, questionText: item.questionText, instructions: item.instructions, expectedAnswer: item.expectedAnswer, correctionGuide: item.correctionGuide, points: item.points };
      }).sort((a, b) => a.order - b.order);
      assert.equal(syntheticQuestionsForReview.reduce((sum, item) => sum + item.points, 0), 20, 'ASSESSMENT_POINT_TOTAL_MISMATCH');
      report.assessments.push({ index, language, cycle, operationId: assessment.aiOperationId, itemCount: assessment.itemCount, totalPoints: assessment.totalPoints, draftOnly: true, callableLatencyMs, syntheticQuestionsForReview });
      console.log(JSON.stringify({ phase: 'assessment', completed: report.assessments.length, provider: 'openai' }));
    }
    assert.ok(report.documentChecks.every(item => item.titleAnchorMatched && item.contentAnchorsMatched), 'SYNTHETIC_EXTRACTION_QUALITY_REVIEW_REQUIRED');
  } catch (error) { failure = safeError(error); }
  finally {
    if (ownsFriday) {
      try { await fridayRef.update({ enabled: false, disabledAt: FieldValue.serverTimestamp() }); }
      catch { failure ||= 'FRIDAY_DISABLE_FAILED'; cleanupIssues.push('FRIDAY_DISABLE_FAILED'); }
      report.retainedFridayAudit = { configuration: fridayRef.path, deliveryReceipts: fridayRef.path + '/trialTicks', runCollection: 'pedagogyFridayRuns', schoolId, reason: 'disabled non-personal scheduler proof retained with consumed trial ledger' };
    }
    if (ownsFixture) {
      try {
        await configRef.update({ enabled: false, disabledReason: 'TRIAL_FINISHED_OR_INTERRUPTED' });
        const operations = await db.collection('pedagogyAiOperations').where('schoolId', '==', schoolId).limit(11).get();
        assert.ok(operations.size <= 10, 'TRIAL_OPERATION_LIMIT_EXCEEDED');
        report.operations = operations.docs.map(doc => { const value = doc.data(); return { operationId: doc.id, purpose: value.purpose, status: value.status, reservedMicros: value.reservedMicros, inputTokens: value.result?.inputTokens ?? null, outputTokens: value.result?.outputTokens ?? null, estimatedCostMicros: value.result?.estimatedCostMicros ?? null, operationLatencyMs: value.completedAt && value.startedAt ? value.completedAt.toMillis() - value.startedAt.toMillis() : null, errorCode: value.errorCode || null }; });
        report.attemptedOperations = report.operations.length;
        report.successfulProviderOperations = report.operations.filter(item => item.status === 'succeeded').length;
        report.successfulGenerationRequests = report.successfulProviderOperations;
        report.successfulTokenPreflights = report.operations.filter(item => item.status === 'succeeded' && item.purpose === 'preparation_analysis').length;
        report.totalInputTokens = report.operations.reduce((sum, item) => sum + (item.inputTokens || 0), 0);
        report.totalOutputTokens = report.operations.reduce((sum, item) => sum + (item.outputTokens || 0), 0);
        report.estimatedCostMicros = report.operations.reduce((sum, item) => sum + (item.estimatedCostMicros || 0), 0);
        report.ledger = (await ledgerRef.get()).data();
        assert.ok(report.ledger.reservedMicros <= 2000000, 'TRIAL_BUDGET_EXCEEDED');
        report.unresolvedConsumption = report.operations.some(item => item.status !== 'succeeded');
      } catch { failure ||= 'TRIAL_CONSUMPTION_OR_DISABLE_CHECK_FAILED'; cleanupIssues.push('CONSUMPTION_OR_DISABLE_UNVERIFIED'); }
      try {
        assert.ok(report.operations?.every(item => item.status !== 'processing'), 'AI_OPERATIONS_STILL_IN_FLIGHT');
        for (const collection of ['weeklyAssessments', 'assessmentItems', 'preparationAnalyses', 'audit_logs']) {
          const snapshot = await db.collection(collection).where('schoolId', '==', schoolId).limit(201).get(); assert.ok(snapshot.size <= 200, 'CLEANUP_BOUND_EXCEEDED');
          for (const doc of snapshot.docs) {
            if (collection === 'weeklyAssessments') {
              const revisions = await doc.ref.collection('revisions').limit(6).get(); assert.ok(revisions.size <= 5, 'CLEANUP_REVISION_BOUND_EXCEEDED');
              for (const revision of revisions.docs) { assert.equal(revision.data().schoolId, schoolId); await revision.ref.delete({ lastUpdateTime: revision.updateTime }); }
            }
            await doc.ref.delete({ lastUpdateTime: doc.updateTime });
          }
          assert.ok((await db.collection(collection).where('schoolId', '==', schoolId).limit(1).get()).empty, 'CLEANUP_RESIDUE');
        }
        for (const ref of exact) { const doc = await ref.get(); if (doc.exists) { assert.equal(doc.data().syntheticTrial, trialId); await ref.delete({ lastUpdateTime: doc.updateTime }); } }
        for (const ref of exact) assert.ok(!(await ref.get()).exists, 'EXACT_FIXTURE_RESIDUE');
      } catch { failure ||= 'FIRESTORE_CLEANUP_FAILED'; cleanupIssues.push('FIRESTORE_CLEANUP_FAILED'); }
    }
    for (const object of uploaded) {
      try { await object.file.delete({ ifGenerationMatch: object.generation }); assert.equal((await object.file.exists())[0], false); }
      catch { failure ||= 'STORAGE_CLEANUP_FAILED'; cleanupIssues.push('STORAGE_CLEANUP_FAILED'); }
    }
    if (ownsUser) { try { await auth.deleteUser(uid); try { await auth.getUser(uid); throw new Error('AUTH_RESIDUE'); } catch (error) { if (error.code !== 'auth/user-not-found') throw error; } } catch { failure ||= 'AUTH_CLEANUP_FAILED'; cleanupIssues.push('AUTH_CLEANUP_FAILED'); } }
    if (storageCreatedCount !== uploaded.length) cleanupIssues.push('STORAGE_GENERATION_UNVERIFIED');
    if (cleanupIssues.length) failure ||= 'CLEANUP_VERIFICATION_FAILED';
    report.cleanupIssues = cleanupIssues;
    report.cleanupVerified = ownsFixture && cleanupIssues.length === 0;
    report.status = failure ? 'FAILED' : 'PASSED'; report.errorCode = failure;
    if (manifestCreated) await manifestRef.update({ state: failure ? 'failed_review_required' : 'completed', report, finishedAt: FieldValue.serverTimestamp() });
    // Retain disabled config, immutable consumption operations, global ledger and manifest.
    // They prevent budget resets and preserve uncertainty; they are not pupil fixtures.
    console.log(JSON.stringify(report)); await deleteApp(app);
    if (failure) process.exitCode = 1;
  }
}
