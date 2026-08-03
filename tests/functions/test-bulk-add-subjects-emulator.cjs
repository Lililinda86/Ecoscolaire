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

if (admin.apps.length === 0) {
  admin.initializeApp({
    projectId: 'demo-ecoscolaire-payments-frontend'
  });
}

const db = getFirestore();
const { bulkAddSubjectsToClasses } = require('../../functions/lib/academic/bulkAddSubjectsToClasses.js');

async function runEmulatorTests() {
  console.log('=== DÉMARRAGE DES TESTS ÉMULATEUR FIRESTORE RÉEL (BULK ADD) ===');

  const schoolId = 'emu-school-bulk';
  const academicYearId = '2026-2027';
  const classId1 = 'emu-class-1';
  const classId2 = 'emu-class-2';
  const uid = 'emu-user-operator';

  // Cleanup
  await db.collection('schools').doc(schoolId).delete();
  await db.collection('classes').doc(classId1).delete();
  await db.collection('classes').doc(classId2).delete();
  await db.collection('subjects').doc('subj1').delete();
  await db.collection('subjects').doc('subj2').delete();
  await db.collection('users').doc(uid).delete();

  // Clean programs
  const programsSnap = await db.collection('classPrograms').where('schoolId', '==', schoolId).get();
  for (const p of programsSnap.docs) await p.ref.delete();

  const subjectsSnap = await db.collection('classSubjects').where('schoolId', '==', schoolId).get();
  for (const s of subjectsSnap.docs) await s.ref.delete();

  // Setup metadata
  await db.collection('schools').doc(schoolId).set({ id: schoolId, name: 'École Émulateur Bulk', academicYear: academicYearId });
  await db.collection('classes').doc(classId1).set({ id: classId1, schoolId: schoolId, section: 'francophone' });
  await db.collection('classes').doc(classId2).set({ id: classId2, schoolId: schoolId, section: 'francophone' });
  await db.collection('subjects').doc('subj1').set({ id: 'subj1', name: 'Maths' });
  await db.collection('subjects').doc('subj2').set({ id: 'subj2', name: 'Français' });
  await db.collection('users').doc(uid).set({ id: uid, role: 'director', schoolId: schoolId, isActive: true });

  const mockContext = { auth: { uid } };

  // 1. Initial bulk add
  console.log('Test 1: Ajout de deux matières à deux classes (brouillons initialement absents)');
  const payload1 = {
    schoolId,
    academicYearId,
    classIds: [classId1, classId2],
    subjectIds: ['subj1', 'subj2']
  };

  const res1 = await bulkAddSubjectsToClasses.run(payload1, mockContext);
  console.log('RES1 details:', res1.details);
  assert.strictEqual(res1.classesProcessed, 2);
  assert.strictEqual(res1.totalSubjectsAdded, 4);
  assert.strictEqual(res1.totalDuplicatesIgnored, 0);

  // Vérifier en base
  const program1Id = `${schoolId}__${academicYearId}__${classId1}`;
  const p1 = await db.collection('classPrograms').doc(program1Id).get();
  assert.ok(p1.exists, 'Le programme 1 a été créé');

  const csSnap = await db.collection('classSubjects').where('programId', '==', program1Id).get();
  assert.strictEqual(csSnap.size, 2, '2 matières dans le programme 1');

  // 2. Idempotence test
  console.log('Test 2: Idempotence (ajout doublon)');
  const res2 = await bulkAddSubjectsToClasses.run(payload1, mockContext);
  assert.strictEqual(res2.classesProcessed, 2);
  assert.strictEqual(res2.totalSubjectsAdded, 0, 'Aucun ajout');
  assert.strictEqual(res2.totalDuplicatesIgnored, 4, '4 doublons ignorés');

  // 3. Partial failure test (matière inexistante)
  console.log('Test 3: Matière introuvable');
  const payload3 = { ...payload1, subjectIds: ['subj1', 'subj-invalid'] };
  try {
    await bulkAddSubjectsToClasses.run(payload3, mockContext);
    assert.fail('Devrait échouer car la matière est introuvable');
  } catch (err) {
    assert.match(err.message, /Matière introuvable/);
  }

  // 4. Incompatibility test
  console.log('Test 4: Incompatibilité de section');
  await db.collection('subjects').doc('subj3').set({ id: 'subj3', name: 'Anglais Spe', section: 'anglophone' });
  const payload4 = { ...payload1, subjectIds: ['subj3'] };
  const res4 = await bulkAddSubjectsToClasses.run(payload4, mockContext);

  assert.strictEqual(res4.classesProcessed, 2);
  assert.strictEqual(res4.totalSubjectsAdded, 0);
  assert.strictEqual(res4.details[0].status, 'error');
  assert.match(res4.details[0].error, /INCOMPATIBLE_SUBJECT/);

  // 5. Auth absente
  console.log('Test 5: Auth absente');
  try {
    await bulkAddSubjectsToClasses.run(payload1, { auth: null });
    assert.fail('Devrait échouer car non authentifié');
  } catch (err) {
    assert.match(err.message, /authentifi/i);
  }

  // 6. Rôle interdit
  console.log('Test 6: Rôle interdit');
  await db.collection('users').doc('emu-user-student').set({ id: 'emu-user-student', role: 'student', schoolId: schoolId, isActive: true });
  try {
    await bulkAddSubjectsToClasses.run(payload1, { auth: { uid: 'emu-user-student' } });
    assert.fail('Devrait échouer car rôle interdit');
  } catch (err) {
    assert.match(err.message, /Rôle non autorisé/i);
  }

  // 7. Classe d'une autre école
  console.log("Test 7: Classe d'une autre école");
  const classId3 = 'emu-class-3-other';
  await db.collection('classes').doc(classId3).set({ id: classId3, schoolId: 'other-school', section: 'francophone' });

  const res7 = await bulkAddSubjectsToClasses.run({ ...payload1, classIds: [classId3] }, mockContext);
  assert.strictEqual(res7.classesProcessed, 1);
  assert.strictEqual(res7.details[0].status, 'error');
  assert.match(res7.details[0].error, /CROSS_TENANT_CLASS/);

  // 8. Matière d'une autre école
  console.log("Test 8: Matière d'une autre école");
  await db.collection('subjects').doc('subj-other').set({ id: 'subj-other', name: 'Other', schoolId: 'other-school' });
  try {
    await bulkAddSubjectsToClasses.run({ ...payload1, subjectIds: ['subj-other'] }, mockContext);
    assert.fail("Devrait échouer car matière d'une autre école");
  } catch (err) {
    assert.match(err.message, /cross-tenant/i);
  }

  // 9. Deux appels simultanés identiques (Concurrence)
  console.log('Test 9: Deux appels simultanés identiques (Concurrence)');
  const classId4 = 'emu-class-4';
  await db.collection('classes').doc(classId4).set({ id: classId4, schoolId: schoolId, section: 'francophone' });
  const payload9 = { ...payload1, classIds: [classId4], subjectIds: ['subj1'] };

  const [res9a, res9b] = await Promise.allSettled([
    bulkAddSubjectsToClasses.run(payload9, mockContext),
    bulkAddSubjectsToClasses.run(payload9, mockContext)
  ]);

  const program4Id = `${schoolId}__${academicYearId}__${classId4}`;
  const p4Snap = await db.collection('classPrograms').doc(program4Id).get();
  assert.ok(p4Snap.exists, 'Le classProgram doit exister');
  const p4Data = p4Snap.data();
  assert.ok(p4Data.draftRevisionId, 'Le draftRevisionId doit être défini');
  assert.strictEqual(p4Data.publishedRevisionId, undefined, 'Le publishedRevisionId doit être inchangé (absent ici)');

  // Le document classProgramRevisions n'est pas explicitement créé pour le brouillon
  // L'identifiant sert de clé de regroupement pour les classSubjects

  const csSnap4 = await db.collection('classSubjects')
    .where('programId', '==', program4Id)
    .where('subjectId', '==', 'subj1')
    .get();
  assert.strictEqual(csSnap4.size, 1, 'Un seul classSubject par classId/subjectId doit exister');

  console.log('✔ TOUS LES TESTS BULK ADD SONT PASSÉS.');
  process.exit(0);
}

runEmulatorTests().catch(err => {
  console.error('ERREUR LORS DES TESTS:', err);
  process.exit(1);
});
