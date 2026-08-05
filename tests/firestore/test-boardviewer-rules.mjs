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
  console.log('🧪 Starting BoardViewer Rules Tests...');
  const testEnv = await initializeTestEnvironment({
    projectId: 'demo-ecoscolaire',
    firestore: {
      rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'),
    },
  });

  try {
    await testEnv.clearFirestore();
    // Setup base data
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.doc('users/board_viewer_user').set({ role: 'boardViewer', schoolId: 'school_A', isActive: true });
      await db.doc('schools/school_A').set({ name: 'School A', activeAcademicYearId: '2026-2027' });
      await db.doc('schools/school_B').set({ name: 'School B' });
      await db.doc('students/student_A').set({ schoolId: 'school_A', name: 'Student A' });
      await db.doc('students/student_B').set({ schoolId: 'school_B', name: 'Student B' });
      await db.doc('payments/payment_A').set({ schoolId: 'school_A', amount: 100 });
      await db.doc('expenses/expense_A').set({ schoolId: 'school_A', amount: 50 });
      await db.doc('grades/grade_A').set({ schoolId: 'school_A', score: 10 });
      await db.doc('attendance/attendance_A').set({ schoolId: 'school_A', present: true });
      await db.doc('staff/staff_A').set({ schoolId: 'school_A', name: 'Staff' });
      await db.doc('buses/bus_A').set({ schoolId: 'school_A', plate: '123' });
      await db.doc('inventory/item_A').set({ schoolId: 'school_A', name: 'Book' });
      await db.doc('validation_requests/val_A').set({ schoolId: 'school_A', status: 'pending', requesterId: 'req' });
    });

    const db = testEnv.authenticatedContext('board_viewer_user', { email: 'board@test.com' }).firestore();

    let passed = 0;
    const expectSucceed = async (name, promise) => {
      try {
        await assertSucceeds(promise);
        console.log(`✅ ${name} (SUCCEED)`);
        passed++;
      } catch (e) {
        console.error(`❌ ${name} (FAILED)`);
        throw e;
      }
    };
    
    const expectFail = async (name, promise) => {
      try {
        await assertFails(promise);
        console.log(`✅ ${name} (FAIL)`);
        passed++;
      } catch (e) {
        console.error(`❌ ${name} (FAILED)`);
        throw e;
      }
    };

    await expectSucceed('lecture autorisée dans sa propre école', db.collection('students').where('schoolId', '==', 'school_A').get());
    await expectFail('lecture refusée dans une autre école', db.collection('students').where('schoolId', '==', 'school_B').get());
    await expectFail('create étudiant refusé', db.collection('students').doc('student_new').set({ schoolId: 'school_A', name: 'New Student' }));
    await expectFail('update étudiant refusé', db.collection('students').doc('student_A').update({ name: 'Modified Name' }));
    await expectFail('delete étudiant refusé', db.collection('students').doc('student_A').delete());
    
    await expectFail('users list refusé', db.collection('users').get());
    await expectSucceed('propre user doc autorisé', db.collection('users').doc('board_viewer_user').get());
    await expectFail('modifier son rôle refusé', db.collection('users').doc('board_viewer_user').update({ role: 'superAdmin' }));
    await expectFail('secrets refusé', db.collection('schools').doc('school_A').collection('secrets').get());
    
    await expectSucceed('paiement lecture autorisée', db.collection('payments').where('schoolId', '==', 'school_A').get());
    await expectFail('paiement création refusée', db.collection('payments').doc('new_payment').set({ schoolId: 'school_A', amount: 100 }));
    
    await expectSucceed('dépense lecture autorisée', db.collection('expenses').where('schoolId', '==', 'school_A').get());
    await expectFail('dépense création refusée', db.collection('expenses').doc('new_exp').set({ schoolId: 'school_A', amount: 50 }));
    
    await expectSucceed('note lecture autorisée', db.collection('grades').where('schoolId', '==', 'school_A').get());
    await expectFail('note création refusée', db.collection('grades').doc('new_grade').set({ schoolId: 'school_A', score: 10 }));
    
    await expectSucceed('présence lecture autorisée', db.collection('attendance').where('schoolId', '==', 'school_A').get());
    await expectFail('présence création refusée', db.collection('attendance').doc('new_att').set({ schoolId: 'school_A', present: true }));
    
    await expectSucceed('personnel lecture autorisée', db.collection('staff').where('schoolId', '==', 'school_A').get());
    await expectFail('personnel création refusée', db.collection('staff').doc('new_staff').set({ schoolId: 'school_A', name: 'John' }));
    
    await expectSucceed('transport lecture autorisée', db.collection('buses').where('schoolId', '==', 'school_A').get());
    await expectFail('transport création refusée', db.collection('buses').doc('new_bus').set({ schoolId: 'school_A', plate: '123' }));
    
    await expectSucceed('inventaire lecture autorisée', db.collection('inventory').where('schoolId', '==', 'school_A').get());
    await expectFail('inventaire création refusée', db.collection('inventory').doc('new_item').set({ schoolId: 'school_A', name: 'Item' }));
    
    await expectFail('paramètres (update school) refusés', db.collection('schools').doc('school_A').update({ name: 'Changed' }));
    
    await expectSucceed('validation requests lecture autorisée', db.collection('validation_requests').where('schoolId', '==', 'school_A').get());
    await expectFail('validation requests update (approuver) refusé', db.collection('validation_requests').doc('val_A').update({ status: 'approved' }));

    console.log(`\n================================`);
    console.log(`All ${passed} tests passed!`);
    console.log(`================================\n`);
    process.exit(0);
  } catch (e) {
    console.error('❌ Test failed', e);
    process.exit(1);
  }
}

runTests();
