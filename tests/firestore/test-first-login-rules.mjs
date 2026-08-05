import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runTests() {
  console.log('🧪 Starting First Login Rules Tests...');
  const testEnv = await initializeTestEnvironment({
    projectId: 'demo-ecoscolaire',
    firestore: {
      rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'),
    },
  });

  try {
    await testEnv.clearFirestore();

    const expectSucceed = async (name, promise) => {
      try {
        await assertSucceeds(promise);
        console.log(`✅ ${name} (SUCCEED)`);
      } catch (e) {
        console.error(`❌ ${name} (FAILED)`);
        throw e;
      }
    };
    
    const expectFail = async (name, promise) => {
      try {
        await assertFails(promise);
        console.log(`✅ ${name} (FAIL)`);
      } catch (e) {
        console.error(`❌ ${name} (FAILED)`);
        throw e;
      }
    };

    // A. Utilisateur authentifié sans document `users/{uid}`
    const dbNewUser = testEnv.authenticatedContext('new_user_123', { email: 'new@test.com' }).firestore();
    await expectSucceed('Lecture de son propre profil (absent) retourne simplement un document inexistant (mais testé comme false par les rules)', dbNewUser.collection('users').doc('new_user_123').get());
    await expectFail('Lecture des écoles refusée', dbNewUser.collection('schools').get());

    // Setup base data for next tests
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.doc('users/active_user').set({ role: 'teacher', schoolId: 'school_A', isActive: true });
      await db.doc('users/inactive_user').set({ role: 'teacher', schoolId: 'school_A', isActive: false });
      await db.doc('schools/school_A').set({ name: 'School A', activeAcademicYearId: '2026-2027' });
    });

    // B. Utilisateur avec profil actif
    const dbActive = testEnv.authenticatedContext('active_user', { email: 'active@test.com' }).firestore();
    await expectSucceed('Lecture de son propre profil autorisée', dbActive.collection('users').doc('active_user').get());

    // C. Utilisateur avec profil inactif
    const dbInactive = testEnv.authenticatedContext('inactive_user', { email: 'inactive@test.com' }).firestore();
    await expectSucceed('Lecture de son propre profil (inactif) possible', dbInactive.collection('users').doc('inactive_user').get());
    await expectFail('Accès métier (écoles) refusé car inactif', dbInactive.collection('schools').doc('school_A').get());

    // D. Lecture du profil d'un autre utilisateur
    await expectFail('Lecture du profil dun autre utilisateur refusée', dbActive.collection('users').doc('inactive_user').get());

    console.log('🎉 First Login Rules Tests Passed!');
  } catch (error) {
    console.error('💥 Test execution failed:', error);
    process.exit(1);
  } finally {
    await testEnv.cleanup();
  }
}

runTests();
