const assert = require('assert');
const path = require('path');
const Module = require('module');
const originalRequire = Module.prototype.require;

const functionsAdminPath = path.resolve(__dirname, '../../functions/node_modules/firebase-admin');

// Intercept firebase-admin imports to redirect to the functions instance
Module.prototype.require = function() {
  const name = arguments[0];
  if (name === 'firebase-admin') {
    return originalRequire.call(this, functionsAdminPath);
  }
  if (name === 'firebase-admin/firestore') {
    return originalRequire.call(this, path.join(functionsAdminPath, 'lib/firestore'));
  }
  return originalRequire.apply(this, arguments);
};

const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

// Initialize firebase-admin with demo projectId
if (admin.apps.length === 0) {
  admin.initializeApp({
    projectId: 'demo-ecoscolaire-payments-frontend'
  });
}

const db = getFirestore();

// We require the compiled JS file directly
const { ensureClassProgramDraft } = require('../../functions/lib/academic/ensureClassProgramDraft.js');

async function runEmulatorTests() {
  console.log('=== DÉMARRAGE DES TESTS ÉMULATEUR FIRESTORE RÉEL ===');

  const schoolId = 'emu-school-1';
  const academicYearId = '2026-2027';
  const classId = 'emu-class-1';
  const programId = `${schoolId}__${academicYearId}__${classId}`;
  const uid = 'emu-user-operator';

  // Cleanup potential leftover emulator data
  await db.collection('schools').doc(schoolId).delete();
  await db.collection('classes').doc(classId).delete();
  await db.collection('classPrograms').doc(programId).delete();
  await db.collection('users').doc(uid).delete();
  
  const subjectsSnap = await db.collection('classSubjects').where('programId', '==', programId).get();
  for (const doc of subjectsSnap.docs) {
    await doc.ref.delete();
  }

  // 1. Setup metadata documents
  await db.collection('schools').doc(schoolId).set({
    id: schoolId,
    name: 'École Émulateur',
    academicYear: academicYearId,
    isInternalSchool: true
  });

  await db.collection('classes').doc(classId).set({
    id: classId,
    schoolId: schoolId,
    name: 'CM2 Émulateur',
    cycle: 'primary'
  });

  await db.collection('users').doc(uid).set({
    id: uid,
    email: 'operator@ecoscolaire.com',
    role: 'secretary',
    schoolId: schoolId,
    isActive: true
  });

  // Verify classPrograms is absent
  const initialSnap = await db.collection('classPrograms').doc(programId).get();
  assert.strictEqual(initialSnap.exists, false, 'Le programme doit être absent au départ.');

  // Helper context
  const mockContext = { auth: { uid } };

  // 3. Call creation function
  console.log('Appel 1: Création initiale...');
  const res1 = await ensureClassProgramDraft.run(
    { schoolId, academicYearId, classId },
    mockContext
  );

  assert.ok(res1);
  assert.strictEqual(res1.programId, programId);
  assert.strictEqual(res1.draftRevisionId, `${programId}__v1`);
  assert.strictEqual(res1.draftRevisionNumber, 1);
  assert.strictEqual(res1.created, true);
  assert.strictEqual(res1.mode, 'initial');

  // 4. Verify document write format in real emulator Firestore
  const createdSnap = await db.collection('classPrograms').doc(programId).get();
  assert.strictEqual(createdSnap.exists, true, 'Le document programme doit exister.');
  const programData = createdSnap.data();

  // Assert fields and type conventions
  assert.strictEqual(programData.id, programId);
  assert.strictEqual(programData.schoolId, schoolId);
  assert.strictEqual(programData.academicYearId, academicYearId);
  assert.strictEqual(programData.classId, classId);
  assert.strictEqual(programData.status, 'draft');
  assert.strictEqual(programData.draftRevisionId, `${programId}__v1`);
  assert.strictEqual(programData.draftRevisionNumber, 1);
  assert.strictEqual(programData.hasUnpublishedChanges, true);
  assert.strictEqual(programData.createdBy, uid);
  assert.strictEqual(programData.updatedBy, uid);
  assert.ok(typeof programData.createdAt === 'string');
  assert.ok(typeof programData.updatedAt === 'string');
  
  // Make sure no undefined or draft Revision references leaked
  assert.strictEqual(programData.publishedRevisionId, undefined);
  assert.strictEqual(programData.publishedRevisionNumber, undefined);

  // 5. Verify no subjects were created
  const createdSubjectsSnap = await db.collection('classSubjects').where('programId', '==', programId).get();
  assert.strictEqual(createdSubjectsSnap.empty, true, 'Aucune matière ne doit exister au départ.');

  // 6. Call a second time sequentially (Idempotency)
  console.log('Appel 2: Idempotence séquentielle...');
  const res2 = await ensureClassProgramDraft.run(
    { schoolId, academicYearId, classId },
    mockContext
  );

  assert.ok(res2);
  assert.strictEqual(res2.created, false);
  assert.strictEqual(res2.draftRevisionId, `${programId}__v1`);
  assert.strictEqual(res2.mode, 'existing-draft');

  // 7. Verify Concurrent requests with Promise.all
  console.log('Appel 3: Concurrence double (Promise.all)...');
  // Delete class program to re-trigger Case A concurrent paths
  await db.collection('classPrograms').doc(programId).delete();

  const [concurrentRes1, concurrentRes2] = await Promise.all([
    ensureClassProgramDraft.run({ schoolId, academicYearId, classId }, mockContext),
    ensureClassProgramDraft.run({ schoolId, academicYearId, classId }, mockContext)
  ]);

  // One of them should have created the program (created: true), the other might be true or false (idempotence/retry depending on transaction interleaving)
  // But both MUST return the exact same programId & draftRevisionId v1.
  assert.strictEqual(concurrentRes1.programId, programId);
  assert.strictEqual(concurrentRes1.draftRevisionId, `${programId}__v1`);
  assert.strictEqual(concurrentRes2.programId, programId);
  assert.strictEqual(concurrentRes2.draftRevisionId, `${programId}__v1`);

  const finalCheckSnap = await db.collection('classPrograms').doc(programId).get();
  assert.strictEqual(finalCheckSnap.exists, true);
  assert.strictEqual(finalCheckSnap.data().draftRevisionNumber, 1);

  console.log('✅ TOUS LES TESTS DE L\'ÉMULATEUR FIRESTORE RÉEL SONT PASSÉS !');
}

runEmulatorTests().catch(err => {
  console.error('❌ ÉCHEC DES TESTS ÉMULATEUR :', err);
  process.exit(1);
});
